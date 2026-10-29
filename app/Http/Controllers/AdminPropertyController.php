<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AdminRequestContext;
use App\Services\AdminAccessService;
use App\Services\CriticalAuditService;
use App\Services\CrmService;
use App\Services\PropertyService;
use App\Services\R2Storage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

class AdminPropertyController extends Controller
{
    use AdminRequestContext;

    private const MIME_EXTENSIONS = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/avif' => ['avif'],
    ];

    public function __construct(
        private readonly AdminAccessService $access,
        private readonly PropertyService $properties,
        private readonly CrmService $crm,
        private readonly CriticalAuditService $criticalAudit,
        private readonly R2Storage $storage,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['draft', 'published', 'archived'])],
            'per_page' => ['sometimes', 'integer', 'between:20,100'],
            'page' => ['sometimes', 'integer', 'between:1,1000'],
        ]);
        $paginator = $this->properties->paginateAdminProperties([
            'search' => trim((string) ($filters['search'] ?? '')),
            'status' => $filters['status'] ?? null,
            'per_page' => (int) ($filters['per_page'] ?? 20),
            'page' => (int) ($filters['page'] ?? 1),
        ]);

        return response()->json([
            'properties' => array_map(
                fn (array $row): array => $this->properties->adminProperty($row),
                $paginator->items()
            ),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'summary' => $this->properties->propertySummary(),
        ])->header('Cache-Control', 'no-store');
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $this->access->requireCurrent($request);
        $manager = $this->access->hasCapability($admin, 'property.publish');
        if (! $manager && ! $this->draftOnlyRequest($request)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $property = $this->criticalAudit->run(
            $admin,
            'property.create',
            'property',
            null,
            fn (): array => $this->properties->saveProperty($request->all(), null, ! $manager),
            fn (array $created): array => [
                'title' => $created['title'],
                'status' => $created['status'],
            ],
        );

        return response()->json(['property' => $this->properties->adminProperty($property)], 201);
    }

    public function show(string $id): JsonResponse
    {
        $this->assertId($id);
        $property = $this->properties->getProperty($id);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json(['property' => $this->properties->adminProperty($property)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->assertId($id);
        $admin = $this->access->requireCurrent($request);
        $current = $this->properties->getProperty($id);
        if (! $current) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $manager = $this->access->hasCapability($admin, 'property.publish');
        if (! $manager && ((string) $current['status'] !== 'draft' || ! $this->draftOnlyRequest($request))) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $property = $this->criticalAudit->run(
            $admin,
            'property.update',
            'property',
            $id,
            fn (): array => $this->properties->saveProperty($request->all(), $id, ! $manager),
            fn (array $updated): array => [
                'title' => $updated['title'],
                'status' => $updated['status'],
            ],
        );

        return response()->json(['property' => $this->properties->adminProperty($property)]);
    }

    public function archive(Request $request, string $id)
    {
        $this->assertId($id);
        $admin = $this->access->requireCurrent($request);
        $this->criticalAudit->run($admin, 'property.archive', 'property', $id, function () use ($id): void {
            if (! $this->properties->archiveProperty($id)) {
                throw new RuntimeException('NOT_FOUND');
            }
        });

        return response()->noContent();
    }

    public function uploadPhoto(Request $request, string $id): JsonResponse
    {
        $propertyId = $this->assertId($id);
        $admin = $this->admin($request);
        $property = $this->properties->getProperty($propertyId);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }
        if (count($property['photos'] ?? []) >= PropertyService::MAX_PHOTOS) {
            return response()->json(['error' => 'PHOTO_LIMIT_REACHED'], 409);
        }

        $file = $request->file('file');
        if (! $file instanceof UploadedFile || ! $file->isValid()) {
            throw new RuntimeException('INVALID_FILE');
        }

        $size = $file->getSize();
        $realPath = $file->getRealPath();
        if (! is_int($size) || $size < 1 || $size > R2Storage::MAX_UPLOAD_BYTES || ! is_string($realPath)) {
            throw new RuntimeException('INVALID_FILE');
        }

        $bytes = file_get_contents($realPath);
        if (! is_string($bytes) || strlen($bytes) !== $size) {
            throw new RuntimeException('INVALID_FILE');
        }

        $image = $this->inspectUploadedImage($bytes);
        if ($image === null) {
            throw new RuntimeException('INVALID_FILE');
        }

        $altText = trim((string) $request->input('altText', ''));
        $sortOrder = $this->sortOrder($request->input('sortOrder', 0));
        $isCover = filter_var($request->input('isCover', false), FILTER_VALIDATE_BOOL);
        if (mb_strlen($altText) > 255) {
            throw new RuntimeException('INVALID_ASSET');
        }

        $baseName = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $storagePath = R2Storage::PREFIX.$propertyId.'/'.Str::uuid().'-'
            .$this->storage->safeFileName($baseName).'.'.$this->extensionForMime($image['mime']);

        try {
            $this->storage->putObject($storagePath, $bytes, $image['mime']);
            $photos = $this->persistPhoto(
                $admin,
                $property,
                $propertyId,
                $storagePath,
                $altText !== '' ? $altText : 'Foto de '.$property['title'],
                $sortOrder,
                $isCover,
                $image['mime'],
                $size,
                $image,
            );
        } catch (\Throwable $error) {
            try {
                $this->storage->delete($storagePath);
            } catch (\Throwable) {
            }
            throw $error;
        }

        return response()->json(['photos' => $this->adminPhotos($photos)], 201);
    }

    public function addPhoto(Request $request, string $id): JsonResponse
    {
        $propertyId = $this->assertId($id);
        $admin = $this->admin($request);
        $property = $this->properties->getProperty($propertyId);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }
        if (count($property['photos'] ?? []) >= PropertyService::MAX_PHOTOS) {
            return response()->json(['error' => 'PHOTO_LIMIT_REACHED'], 409);
        }

        $storagePath = trim((string) $request->input('storagePath', ''));
        $altText = trim((string) $request->input('altText', ''));
        $contentType = strtolower(trim((string) $request->input('contentType', '')));
        $size = $this->fileSize($request->input('size'));
        $width = (int) $request->input('width', 0);
        $height = (int) $request->input('height', 0);
        $sortOrder = (int) $request->input('sortOrder', 0);
        $isCover = filter_var($request->input('isCover', false), FILTER_VALIDATE_BOOL);

        if (
            $storagePath === '' || strlen($storagePath) > 500 || mb_strlen($altText) > 255
            || $width <= 0 || $width > 20000 || $height <= 0 || $height > 20000
            || $sortOrder < 0 || $sortOrder >= PropertyService::MAX_PHOTOS || ! isset(self::MIME_EXTENSIONS[$contentType])
        ) {
            throw new RuntimeException('INVALID_ASSET');
        }

        $extension = strtolower((string) pathinfo($storagePath, PATHINFO_EXTENSION));
        if (! $this->storage->belongsToProperty($storagePath, $propertyId)
            || ! in_array($extension, self::MIME_EXTENSIONS[$contentType], true)) {
            throw new RuntimeException('INVALID_ASSET');
        }

        $metadata = $this->storage->metadata($storagePath);
        if (! $metadata['exists']) {
            throw new RuntimeException('ASSET_NOT_UPLOADED');
        }

        $invalidMetadata = (
            ! is_int($metadata['size'])
            || $metadata['size'] !== $size
            || $metadata['size'] > R2Storage::MAX_UPLOAD_BYTES
        ) || (
            ! is_string($metadata['contentType'])
            || strtolower($metadata['contentType']) !== $contentType
        );
        $image = $invalidMetadata ? null : $this->storage->imageInfo($storagePath, $contentType);
        $invalid = $invalidMetadata || $image === null
            || $image['width'] !== $width
            || $image['height'] !== $height;

        if ($invalid) {
            try {
                $this->storage->delete($storagePath);
            } catch (\Throwable) {
            }
            throw new RuntimeException('INVALID_ASSET');
        }

        try {
            $photos = $this->persistPhoto(
                $admin,
                $property,
                $propertyId,
                $storagePath,
                $altText !== '' ? $altText : 'Foto de '.$property['title'],
                $sortOrder,
                $isCover,
                $contentType,
                $size,
                $image,
            );
        } catch (\Throwable $error) {
            if ($error->getMessage() !== 'ASSET_ALREADY_REGISTERED') {
                try {
                    $this->storage->delete($storagePath);
                } catch (\Throwable) {
                }
            }
            throw $error;
        }

        return response()->json(['photos' => $this->adminPhotos($photos)], 201);
    }

    public function photoMedia(string $id): RedirectResponse|JsonResponse
    {
        $this->assertId($id);
        $photo = $this->properties->getPhoto($id);
        if (! $photo) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return redirect()->away(
            $this->storage->presignGet(
                (string) $photo['storage_path'],
                60,
                (string) ($photo['mime_type'] ?? ''),
                basename((string) $photo['storage_path']),
                'private, no-store',
            ),
            307,
        )->header('Cache-Control', 'no-store');
    }

    public function removePhoto(Request $request, string $id)
    {
        $this->assertId($id);
        $admin = $this->access->requireCurrent($request);
        $photo = $this->properties->getPhoto($id);
        if (! $photo) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $property = $this->properties->getProperty((string) $photo['property_id']);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $removed = $this->criticalAudit->run($admin, 'photo.remove', 'photo', $id, function () use ($id, $admin): array {
            return $this->properties->removePhoto(
                $id,
                ! $this->access->hasCapability($admin, 'property.publish')
            ) ?? throw new RuntimeException('NOT_FOUND');
        }, ['propertyId' => $property['id']]);

        try {
            $this->storage->delete((string) $removed['storage_path']);
        } catch (\Throwable $error) {
            report($error);
        }

        return response()->noContent();
    }

    public function reorder(Request $request, string $id): JsonResponse
    {
        $propertyId = $this->assertId($id);
        $admin = $this->admin($request);
        $property = $this->properties->getProperty($propertyId);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $photoIds = $request->input('photoIds');
        if (! is_array($photoIds) || count($photoIds) > 40 || count($photoIds) !== count(array_unique($photoIds))) {
            throw new RuntimeException('INVALID_ORDER');
        }
        foreach ($photoIds as $photoId) {
            $this->assertId((string) $photoId);
        }

        $photos = $this->criticalAudit->run(
            $admin,
            'photo.reorder',
            'property',
            $propertyId,
            fn (): array => $this->properties->reorderPhotos(
                $propertyId,
                array_values(array_map('strval', $photoIds)),
                ! $this->access->hasCapability($admin, 'property.publish')
            ),
            ['photoCount' => count($photoIds)],
        );

        return response()->json(['photos' => $this->adminPhotos($photos)]);
    }

    public function cover(Request $request, string $id): JsonResponse
    {
        $this->assertId($id);
        $admin = $this->admin($request);
        $photo = $this->properties->getPhoto($id);
        if (! $photo) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $property = $this->properties->getProperty((string) $photo['property_id']);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $photos = $this->criticalAudit->run(
            $admin,
            'photo.cover',
            'photo',
            $id,
            fn (): array => $this->properties->setCover(
                $id,
                ! $this->access->hasCapability($admin, 'property.publish')
            ) ?? throw new RuntimeException('NOT_FOUND'),
        );

        return response()->json(['photos' => $this->adminPhotos($photos)]);
    }

    private function draftOnlyRequest(Request $request): bool
    {
        $status = (string) $request->input('status', 'draft');
        $featured = filter_var($request->input('featured', false), FILTER_VALIDATE_BOOL);

        return $status === 'draft' && ! $featured;
    }

    private function canManageMedia(array $admin, array $property): bool
    {
        return $this->access->hasCapability($admin, 'media.manage')
            && ($this->access->hasCapability($admin, 'property.publish') || (string) $property['status'] === 'draft');
    }

    private function adminPhotos(array $photos): array
    {
        return array_map(fn (array $photo): array => [
            'id' => (string) $photo['id'],
            'url' => '/api/admin/photos/'.rawurlencode((string) $photo['id']).'/media',
            'alt_text' => (string) ($photo['alt_text'] ?? ''),
            'sort_order' => (int) ($photo['sort_order'] ?? 0),
            'is_cover' => (bool) ($photo['is_cover'] ?? false),
            'created_at' => $photo['created_at'] ?? null,
        ], $photos);
    }

    private function fileSize(mixed $value): int
    {
        if (is_int($value)) {
            $size = $value;
        } elseif (is_string($value) && strlen($value) <= 8 && preg_match('/^[0-9]+$/D', $value)) {
            $size = (int) $value;
        } else {
            throw new RuntimeException('INVALID_FILE');
        }

        if ($size < 1 || $size > R2Storage::MAX_UPLOAD_BYTES) {
            throw new RuntimeException('INVALID_FILE');
        }

        return $size;
    }

    /**
     * @return array{width: int, height: int, mime: string}|null
     */
    private function inspectUploadedImage(string $bytes): ?array
    {
        foreach (array_keys(self::MIME_EXTENSIONS) as $contentType) {
            $image = R2Storage::imageInfoFromBytes($bytes, $contentType);
            if ($image !== null) {
                return $image;
            }
        }

        return null;
    }

    private function extensionForMime(string $mime): string
    {
        return self::MIME_EXTENSIONS[$mime][0] ?? throw new RuntimeException('INVALID_FILE');
    }

    private function sortOrder(mixed $value): int
    {
        if (is_int($value)) {
            $sortOrder = $value;
        } elseif (is_string($value) && strlen($value) <= 3 && preg_match('/^[0-9]+$/D', $value)) {
            $sortOrder = (int) $value;
        } else {
            throw new RuntimeException('INVALID_ASSET');
        }

        if ($sortOrder < 0 || $sortOrder >= PropertyService::MAX_PHOTOS) {
            throw new RuntimeException('INVALID_ASSET');
        }

        return $sortOrder;
    }

    /**
     * @param  array{width: int, height: int, mime: string}  $image
     * @return list<array<string, mixed>>
     */
    private function persistPhoto(
        array $admin,
        array $property,
        string $propertyId,
        string $storagePath,
        string $altText,
        int $sortOrder,
        bool $isCover,
        string $contentType,
        int $size,
        array $image,
    ): array {
        $photoId = (string) Str::uuid();

        return $this->criticalAudit->run(
            $admin,
            'photo.add',
            'photo',
            $photoId,
            fn (): array => $this->properties->addPhoto([
                'id' => $photoId,
                'property_id' => $propertyId,
                'storage_path' => $storagePath,
                'url' => $this->storage->assetUrl($storagePath),
                'alt_text' => $altText,
                'sort_order' => $sortOrder,
                'is_cover' => $isCover ? 1 : 0,
                'storage_provider' => 'r2',
                'mime_type' => $contentType,
                'file_size' => $size,
                'width' => $image['width'],
                'height' => $image['height'],
                'uploaded_by' => $admin['email'],
            ], ! $this->access->hasCapability($admin, 'property.publish')),
            ['propertyId' => $propertyId, 'storagePath' => $storagePath],
        );
    }
}
