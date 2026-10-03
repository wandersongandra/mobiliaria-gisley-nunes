<?php

namespace App\Services;

// Escopo atual: Single-tenant. Não há isolamento por proprietário/imobiliária nesta versão.

use Illuminate\Database\QueryException;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class PropertyService
{
    public const PUBLIC_CATALOG_CACHE_KEY = 'public-property-catalog.v1';

    public const PUBLIC_CATALOG_TTL = 60;

    private const STATUSES = ['draft', 'published', 'archived'];

    private const PURPOSES = ['Comprar', 'Alugar'];

    private const TYPES = ['Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote'];

    /**
     * Catálogo público em cache. É o único ponto de leitura cacheada, de modo que
     * as invalidações feitas pelos métodos de escrita abaixo nunca fiquem órfãs.
     *
     * @return array<int, array<string, mixed>>
     */
    public function publicCatalog(): array
    {
        return Cache::remember(
            self::PUBLIC_CATALOG_CACHE_KEY,
            self::PUBLIC_CATALOG_TTL,
            fn (): array => array_map(
                fn (array $row): array => $this->publicProperty($row),
                $this->listProperties(true)
            )
        );
    }

    public function listProperties(bool $publicOnly = false): array
    {
        $query = DB::table('morada_properties as p')
            ->leftJoin('morada_property_photos as ph', function ($join): void {
                $join->on('ph.property_id', '=', 'p.id')->where('ph.is_cover', '=', 1);
            })
            ->select('p.*', DB::raw('CASE WHEN p.price < 1500000 THEN 1 WHEN p.price <= 3000000 THEN 2 ELSE 3 END AS price_band'), DB::raw("COALESCE(ph.url, '') AS cover_url"));

        if ($publicOnly) {
            $query->where('p.status', 'published')
                ->orderByDesc('p.is_featured')
                ->orderByDesc('p.updated_at');
        } else {
            $query->orderByRaw("(p.status = 'archived') ASC")
                ->orderByDesc('p.updated_at');
        }

        return $this->hydratePhotos($query->get()->map(fn ($row) => (array) $row)->all());
    }

    public function paginateAdminProperties(array $filters): LengthAwarePaginator
    {
        $query = DB::table('morada_properties as p')
            ->leftJoin('morada_property_photos as ph', function ($join): void {
                $join->on('ph.property_id', '=', 'p.id')->where('ph.is_cover', '=', 1);
            })
            ->select('p.*', DB::raw("COALESCE(ph.url, '') AS cover_url"));

        if (isset($filters['status'])) {
            $query->where('p.status', $filters['status']);
        }

        if (isset($filters['search']) && $filters['search'] !== '') {
            $search = '%'.$filters['search'].'%';
            $query->where(function ($query) use ($search): void {
                $query->where('p.title', 'like', $search)
                    ->orWhere('p.location', 'like', $search)
                    ->orWhere('p.city', 'like', $search)
                    ->orWhere('p.type', 'like', $search)
                    ->orWhere('p.slug', 'like', $search);
            });
        }

        $paginator = $query
            ->orderByRaw("(p.status = 'archived') ASC")
            ->orderByDesc('p.updated_at')
            ->orderByDesc('p.id')
            ->paginate($filters['per_page'], ['*'], 'page', $filters['page']);

        $rows = $this->hydratePhotos(
            $paginator->getCollection()->map(static fn ($row): array => (array) $row)->all()
        );
        $paginator->setCollection(collect($rows));

        return $paginator;
    }

    public function propertySummary(): array
    {
        $counts = DB::table('morada_properties')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw("SUM(CASE WHEN status <> 'archived' THEN 1 ELSE 0 END) AS active")
            ->selectRaw("SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published")
            ->selectRaw("SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft")
            ->first();

        return [
            'total' => (int) ($counts->total ?? 0),
            'active' => (int) ($counts->active ?? 0),
            'published' => (int) ($counts->published ?? 0),
            'draft' => (int) ($counts->draft ?? 0),
        ];
    }

    public function getProperty(string $id): ?array
    {
        $row = DB::table('morada_properties as p')
            ->leftJoin('morada_property_photos as ph', function ($join): void {
                $join->on('ph.property_id', '=', 'p.id')->where('ph.is_cover', '=', 1);
            })
            ->select('p.*', DB::raw("COALESCE(ph.url, '') AS cover_url"))
            ->where('p.id', $id)
            ->first();

        if (! $row) {
            return null;
        }

        return $this->hydratePhotos([(array) $row])[0];
    }

    public function getPropertyBySlug(string $slug): ?array
    {
        $slug = $this->normalizeSlug($slug);

        $row = DB::table('morada_properties as p')
            ->leftJoin('morada_property_photos as ph', function ($join): void {
                $join->on('ph.property_id', '=', 'p.id')->where('ph.is_cover', '=', 1);
            })
            ->select('p.*', DB::raw("COALESCE(ph.url, '') AS cover_url"))
            ->where('p.slug', $slug)
            ->where('p.status', 'published')
            ->first();

        if (! $row) {
            return null;
        }

        return $this->hydratePhotos([(array) $row])[0];
    }

    private function hydratePhotos(array $rows): array
    {
        if (! $rows) {
            return [];
        }

        $ids = array_column($rows, 'id');
        $photos = DB::table('morada_property_photos')
            ->whereIn('property_id', $ids)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get()
            ->groupBy('property_id');

        foreach ($rows as &$row) {
            $row['photos'] = isset($photos[$row['id']])
                ? $photos[$row['id']]->map(fn ($photo) => (array) $photo)->all()
                : [];
        }

        return $rows;
    }

    public function normalizeInput(array $input): array
    {
        $allowed = [
            'title', 'slug', 'location', 'city', 'purpose', 'type', 'price', 'priceLabel',
            'bedrooms', 'bathrooms', 'areaM2', 'suites', 'parkingSpots', 'condoFee', 'iptu',
            'description', 'status', 'featured',
        ];

        if (array_diff(array_keys($input), $allowed)) {
            throw new RuntimeException('INVALID_PROPERTY');
        }

        $title = $this->text($input['title'] ?? '', 160, true);
        $location = $this->text($input['location'] ?? '', 180, true);
        $city = $this->text($input['city'] ?? 'Belo Horizonte', 120, true);
        $purpose = (string) ($input['purpose'] ?? 'Comprar');
        $type = (string) ($input['type'] ?? 'Apartamento');
        $status = (string) ($input['status'] ?? 'draft');

        if (! in_array($purpose, self::PURPOSES, true)
            || ! in_array($type, self::TYPES, true)
            || ! in_array($status, self::STATUSES, true)) {
            throw new RuntimeException('INVALID_PROPERTY');
        }

        $price = $this->number($input['price'] ?? 0, 999999999999.99);
        $slug = trim((string) ($input['slug'] ?? ''));
        if ($slug !== '' && ! preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            throw new RuntimeException('INVALID_PROPERTY');
        }

        $automaticPrice = $price > 0
            ? 'R$ '.number_format($price, 0, ',', '.').($purpose === 'Alugar' ? ' / mês' : '')
            : 'Sob consulta';

        return [
            'title' => $title,
            'slug' => $slug,
            'location' => $location,
            'city' => $city,
            'purpose' => $purpose,
            'type' => $type,
            'price' => $price,
            'price_label' => $this->text($input['priceLabel'] ?? $automaticPrice, 100, true),
            'bedrooms' => $this->integer($input['bedrooms'] ?? 0, 50),
            'bathrooms' => $this->integer($input['bathrooms'] ?? 0, 50),
            'area_m2' => $this->number($input['areaM2'] ?? 0, 9999999.99),
            'suites' => $this->integer($input['suites'] ?? 0, 50),
            'parking_spots' => $this->integer($input['parkingSpots'] ?? 0, 50),
            'condo_fee' => $this->number($input['condoFee'] ?? 0, 99999999.99),
            'iptu' => $this->number($input['iptu'] ?? 0, 9999999999.99),
            'description' => $this->text($input['description'] ?? '', 6000, false),
            'status' => $status,
            'is_featured' => $this->boolean($input['featured'] ?? false) ? 1 : 0,
        ];
    }

    public function saveProperty(array $input, ?string $id = null, bool $requireDraft = false): array
    {
        $data = $this->normalizeInput($input);

        if ($requireDraft && ($data['status'] !== 'draft' || $data['is_featured'] === 1)) {
            throw new RuntimeException('CAPABILITY_REQUIRED');
        }

        $propertyId = $id ?: (string) Str::uuid();

        DB::transaction(function () use ($data, $propertyId, $id, $requireDraft): void {
            $existing = $id
                ? DB::table('morada_properties')->where('id', $propertyId)->lockForUpdate()->first()
                : null;

            if ($id && ! $existing) {
                throw new RuntimeException('NOT_FOUND');
            }

            if ($requireDraft && $existing && (string) $existing->status !== 'draft') {
                throw new RuntimeException('CAPABILITY_REQUIRED');
            }

            if ($data['status'] === 'published'
                && ! DB::table('morada_property_photos')
                    ->where('property_id', $propertyId)
                    ->where('is_cover', true)
                    ->exists()) {
                throw new RuntimeException('COVER_REQUIRED');
            }

            $generated = Str::slug($data['title']) ?: $propertyId;
            $slug = substr($data['slug'] ?: ((string) ($existing->slug ?? '') ?: $generated), 0, 180);
            $slug = $this->uniqueSlug($slug, $id, $id === null && $data['slug'] === '');

            $payload = $data;
            $payload['slug'] = $slug;
            $payload['updated_at'] = now();

            try {
                if ($id) {
                    DB::table('morada_properties')->where('id', $propertyId)->update($payload);
                } else {
                    DB::table('morada_properties')->insert($payload + [
                        'id' => $propertyId,
                        'created_at' => now(),
                    ]);
                }
            } catch (QueryException $e) {
                if ($this->isSlugConflict($e)) {
                    throw new RuntimeException('SLUG_CONFLICT', previous: $e);
                }
                throw $e;
            }
        });
        Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);

        $property = $this->getProperty($propertyId);
        if (! $property) {
            throw new RuntimeException('NOT_FOUND');
        }

        return $property;
    }

    public function archiveProperty(string $id): bool
    {
        $updated = DB::table('morada_properties')
            ->where('id', $id)
            ->update(['status' => 'archived', 'is_featured' => 0, 'updated_at' => now()]) > 0;

        if ($updated) {
            Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);
        }

        return $updated;
    }

    public function listPhotos(string $propertyId): array
    {
        return DB::table('morada_property_photos')
            ->where('property_id', $propertyId)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get()
            ->map(fn ($row) => (array) $row)
            ->all();
    }

    public function getPhoto(string $photoId): ?array
    {
        $row = DB::table('morada_property_photos')->where('id', $photoId)->first();

        return $row ? (array) $row : null;
    }

    public function registeredStoragePaths(array $paths): array
    {
        if ($paths === []) {
            return [];
        }

        return DB::table('morada_property_photos')
            ->whereIn('storage_path', array_values(array_unique($paths)))
            ->pluck('storage_path')
            ->all();
    }

    public function addPhoto(array $photo, bool $requireDraft = false): array
    {
        DB::transaction(function () use ($photo, $requireDraft): void {
            $property = DB::table('morada_properties')->where('id', $photo['property_id'])->lockForUpdate()->first();
            if (! $property) {
                throw new RuntimeException('NOT_FOUND');
            }

            if ($requireDraft && (string) $property->status !== 'draft') {
                throw new RuntimeException('CAPABILITY_REQUIRED');
            }

            if (DB::table('morada_property_photos')->where('property_id', $photo['property_id'])->count() >= 40) {
                throw new RuntimeException('PHOTO_LIMIT_REACHED');
            }

            if (DB::table('morada_property_photos')->where('storage_path', $photo['storage_path'])->exists()) {
                throw new RuntimeException('ASSET_ALREADY_REGISTERED');
            }

            if ($photo['is_cover']) {
                DB::table('morada_property_photos')
                    ->where('property_id', $photo['property_id'])
                    ->update(['is_cover' => 0]);
            }

            DB::table('morada_property_photos')->insert($photo + ['created_at' => now()]);
        });
        Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);

        return $this->listPhotos($photo['property_id']);
    }

    public function removePhoto(string $photoId, bool $requireDraft = false): ?array
    {
        $removed = DB::transaction(function () use ($photoId, $requireDraft): ?array {
            $photo = DB::table('morada_property_photos')->where('id', $photoId)->first();
            if (! $photo) {
                return null;
            }

            $property = DB::table('morada_properties')->where('id', $photo->property_id)->lockForUpdate()->first();
            if (! $property) {
                return null;
            }

            $photo = DB::table('morada_property_photos')
                ->where('id', $photoId)
                ->where('property_id', $property->id)
                ->lockForUpdate()
                ->first();
            if (! $photo) {
                return null;
            }

            if ($requireDraft && (string) $property->status !== 'draft') {
                throw new RuntimeException('CAPABILITY_REQUIRED');
            }

            if ((string) $property->status === 'published'
                && (bool) $photo->is_cover
                && DB::table('morada_property_photos')
                    ->where('property_id', $photo->property_id)
                    ->count() === 1) {
                throw new RuntimeException('COVER_REQUIRED');
            }

            DB::table('morada_property_photos')->where('id', $photoId)->delete();

            if ((bool) $photo->is_cover) {
                $next = DB::table('morada_property_photos')
                    ->where('property_id', $photo->property_id)
                    ->orderBy('sort_order')
                    ->orderBy('created_at')
                    ->first();
                if ($next) {
                    DB::table('morada_property_photos')->where('id', $next->id)->update(['is_cover' => 1]);
                }
            }

            return (array) $photo;
        });

        if ($removed !== null) {
            Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);
        }

        return $removed;
    }

    public function reorderPhotos(string $propertyId, array $photoIds, bool $requireDraft = false): array
    {
        DB::transaction(function () use ($propertyId, $photoIds, $requireDraft): void {
            $property = DB::table('morada_properties')->where('id', $propertyId)->lockForUpdate()->first();
            if (! $property) {
                throw new RuntimeException('NOT_FOUND');
            }

            if ($requireDraft && (string) $property->status !== 'draft') {
                throw new RuntimeException('CAPABILITY_REQUIRED');
            }

            $current = DB::table('morada_property_photos')
                ->where('property_id', $propertyId)
                ->pluck('id')
                ->all();

            sort($current);
            $requested = $photoIds;
            sort($requested);

            if ($current !== $requested) {
                throw new RuntimeException('INVALID_ORDER');
            }

            foreach ($photoIds as $index => $photoId) {
                DB::table('morada_property_photos')
                    ->where('id', $photoId)
                    ->where('property_id', $propertyId)
                    ->update(['sort_order' => $index]);
            }
        });
        Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);

        return $this->listPhotos($propertyId);
    }

    public function setCover(string $photoId, bool $requireDraft = false): ?array
    {
        $photo = $this->getPhoto($photoId);
        if (! $photo) {
            return null;
        }

        DB::transaction(function () use ($photo, $photoId, $requireDraft): void {
            $property = DB::table('morada_properties')->where('id', $photo['property_id'])->lockForUpdate()->first();
            if (! $property) {
                throw new RuntimeException('NOT_FOUND');
            }

            $selectedPhoto = DB::table('morada_property_photos')
                ->where('id', $photoId)
                ->where('property_id', $property->id)
                ->lockForUpdate()
                ->first();
            if (! $selectedPhoto) {
                throw new RuntimeException('NOT_FOUND');
            }

            if ($requireDraft && (string) $property->status !== 'draft') {
                throw new RuntimeException('CAPABILITY_REQUIRED');
            }

            DB::table('morada_property_photos')->where('property_id', $photo['property_id'])->update(['is_cover' => 0]);
            DB::table('morada_property_photos')
                ->where('id', $photoId)
                ->where('property_id', $property->id)
                ->update(['is_cover' => 1]);
        });
        Cache::forget(self::PUBLIC_CATALOG_CACHE_KEY);

        return $this->listPhotos($photo['property_id']);
    }

    public function findPublishedPhotoByStoragePath(string $path): ?array
    {
        $row = DB::table('morada_property_photos as ph')
            ->join('morada_properties as p', 'p.id', '=', 'ph.property_id')
            ->where('ph.storage_path', $path)
            ->where('p.status', 'published')
            ->select('ph.*')
            ->first();

        return $row ? (array) $row : null;
    }

    public function publicProperty(array $row): array
    {
        return [
            'slug' => (string) ($row['slug'] ?? ''),
            'title' => (string) ($row['title'] ?? ''),
            'location' => (string) ($row['location'] ?? ''),
            'city' => (string) ($row['city'] ?? ''),
            'purpose' => (string) ($row['purpose'] ?? ''),
            'type' => (string) ($row['type'] ?? ''),
            'price' => (float) ($row['price'] ?? 0),
            'price_label' => (string) ($row['price_label'] ?? ''),
            'bedrooms' => (int) ($row['bedrooms'] ?? 0),
            'bathrooms' => (int) ($row['bathrooms'] ?? 0),
            'area_m2' => (float) ($row['area_m2'] ?? 0),
            'suites' => (int) ($row['suites'] ?? 0),
            'parking_spots' => (int) ($row['parking_spots'] ?? 0),
            'condo_fee' => (float) ($row['condo_fee'] ?? 0),
            'iptu' => (float) ($row['iptu'] ?? 0),
            'description' => (string) ($row['description'] ?? ''),
            'is_featured' => (bool) ($row['is_featured'] ?? false),
            'cover_url' => $this->safeMediaUrl($row['cover_url'] ?? ''),
            'updated_at' => $row['updated_at'] ?? null,
            'photos' => array_map(fn (array $photo): array => [
                'url' => $this->safeMediaUrl($photo['url'] ?? ''),
                'alt_text' => (string) ($photo['alt_text'] ?? ''),
                'sort_order' => (int) ($photo['sort_order'] ?? 0),
                'is_cover' => (bool) ($photo['is_cover'] ?? false),
            ], $row['photos'] ?? []),
        ];
    }

    public function adminProperty(array $row): array
    {
        $photos = array_map(function (array $photo): array {
            $id = (string) ($photo['id'] ?? '');

            return [
                'id' => $id,
                'url' => $id !== '' ? '/api/admin/photos/'.rawurlencode($id).'/media' : $this->safeMediaUrl($photo['url'] ?? ''),
                'alt_text' => (string) ($photo['alt_text'] ?? ''),
                'sort_order' => (int) ($photo['sort_order'] ?? 0),
                'is_cover' => (bool) ($photo['is_cover'] ?? false),
                'created_at' => $photo['created_at'] ?? null,
            ];
        }, $row['photos'] ?? []);

        $cover = collect($photos)->firstWhere('is_cover', true) ?: ($photos[0] ?? null);

        return [
            'id' => (string) ($row['id'] ?? ''),
            'slug' => (string) ($row['slug'] ?? ''),
            'title' => (string) ($row['title'] ?? ''),
            'location' => (string) ($row['location'] ?? ''),
            'city' => (string) ($row['city'] ?? ''),
            'purpose' => (string) ($row['purpose'] ?? ''),
            'type' => (string) ($row['type'] ?? ''),
            'price' => (float) ($row['price'] ?? 0),
            'price_label' => (string) ($row['price_label'] ?? ''),
            'bedrooms' => (int) ($row['bedrooms'] ?? 0),
            'bathrooms' => (int) ($row['bathrooms'] ?? 0),
            'area_m2' => (float) ($row['area_m2'] ?? 0),
            'suites' => (int) ($row['suites'] ?? 0),
            'parking_spots' => (int) ($row['parking_spots'] ?? 0),
            'condo_fee' => (float) ($row['condo_fee'] ?? 0),
            'iptu' => (float) ($row['iptu'] ?? 0),
            'description' => (string) ($row['description'] ?? ''),
            'status' => (string) ($row['status'] ?? 'draft'),
            'is_featured' => (bool) ($row['is_featured'] ?? false),
            'cover_url' => $cover['url'] ?? '',
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'photos' => $photos,
        ];
    }

    public function neighborhoods(array $publicProperties): array
    {
        $groups = [];

        foreach ($publicProperties as $property) {
            $name = trim(explode('·', (string) ($property['location'] ?? ''))[0]);
            if ($name === '') {
                $name = trim((string) ($property['city'] ?? ''));
            }
            if ($name === '') {
                continue;
            }

            $slug = Str::slug($name);
            $groups[$slug] ??= ['slug' => $slug, 'name' => $name, 'count' => 0, 'properties' => []];
            $groups[$slug]['count']++;
            $groups[$slug]['properties'][] = $property;
        }

        uasort($groups, fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']));

        return array_values($groups);
    }

    private function safeMediaUrl(mixed $value): string
    {
        $raw = trim((string) $value);
        if ($raw === '') {
            return '';
        }

        if (str_starts_with($raw, '/media/')) {
            return $raw;
        }

        if (filter_var($raw, FILTER_VALIDATE_URL) && str_starts_with(strtolower($raw), 'https://')) {
            return $raw;
        }

        return '';
    }

    private function normalizeSlug(string $value): string
    {
        $value = strtolower(trim($value));
        if (! preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $value)) {
            throw new RuntimeException('NOT_FOUND');
        }

        return substr($value, 0, 180);
    }

    private function uniqueSlug(string $slug, ?string $id, bool $generateSuffix): string
    {
        $query = DB::table('morada_properties')->where('slug', $slug);
        if ($id !== null) {
            $query->where('id', '!=', $id);
        }
        if (! $query->exists()) {
            return $slug;
        }
        if (! $generateSuffix) {
            throw new RuntimeException('SLUG_CONFLICT');
        }

        for ($suffix = 2; $suffix < 10_000; $suffix++) {
            $tail = '-'.$suffix;
            $candidate = rtrim(substr($slug, 0, 180 - strlen($tail)), '-').$tail;
            if (! DB::table('morada_properties')->where('slug', $candidate)->exists()) {
                return $candidate;
            }
        }

        throw new RuntimeException('SLUG_CONFLICT');
    }

    private function isSlugConflict(QueryException $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'unique constraint failed: morada_properties.slug')
            || str_contains($message, 'morada_properties_slug_unique')
            || str_contains($message, "for key 'slug'");
    }

    private function text(mixed $value, int $max, bool $required): string
    {
        $value = trim((string) $value);
        if (($required && $value === '') || mb_strlen($value) > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $value)) {
            throw new RuntimeException('INVALID_PROPERTY');
        }

        return $value;
    }

    private function number(mixed $value, float $max): float
    {
        if ($value === '' || $value === null) {
            return 0.0;
        }

        if (! is_numeric($value)) {
            throw new RuntimeException('INVALID_PROPERTY_NUMBER');
        }

        $number = (float) $value;
        if ($number < 0 || $number > $max || ! is_finite($number)) {
            throw new RuntimeException('INVALID_PROPERTY_NUMBER');
        }

        return $number;
    }

    private function integer(mixed $value, int $max): int
    {
        $number = $this->number($value, $max);
        if ((float) (int) $number !== $number) {
            throw new RuntimeException('INVALID_PROPERTY_NUMBER');
        }

        return (int) $number;
    }

    private function boolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array($value, [1, '1', 'true', 'on', 'yes'], true);
    }
}
