<?php

namespace App\Http\Controllers;

use App\Services\AdminAccessService;
use App\Services\CrmService;
use App\Services\PropertyService;
use App\Services\R2Storage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

class AdminPropertyController extends Controller
{
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
        private readonly R2Storage $storage,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'properties' => array_map(
                fn (array $row): array => $this->properties->adminProperty($row),
                $this->properties->listProperties()
            ),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $manager = $this->access->hasCapability($admin, 'property.publish');
        if (! $manager && ! $this->draftOnlyRequest($request)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $property = $this->properties->saveProperty($request->all(), null, ! $manager);
        $this->audit($admin, 'property.create', 'property', $property['id'], [
            'title' => $property['title'], 'status' => $property['status'],
        ]);

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
        $admin = $this->admin($request);
        $current = $this->properties->getProperty($id);
        if (! $current) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $manager = $this->access->hasCapability($admin, 'property.publish');
        if (! $manager && ((string) $current['status'] !== 'draft' || ! $this->draftOnlyRequest($request))) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        $property = $this->properties->saveProperty($request->all(), $id, ! $manager);
        $this->audit($admin, 'property.update', 'property', $id, [
            'title' => $property['title'], 'status' => $property['status'],
        ]);

        return response()->json(['property' => $this->properties->adminProperty($property)]);
    }

    public function archive(Request $request, string $id)
    {
        $this->assertId($id);
        if (! $this->properties->archiveProperty($id)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        $this->audit($this->admin($request), 'property.archive', 'property', $id);

        return response()->noContent();
    }

    public function presign(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $propertyId = $this->assertId((string) $request->input('propertyId', ''));
        $fileName = trim((string) $request->input('fileName', ''));
        $contentType = strtolower(trim((string) $request->input('contentType', '')));
        $size = $this->fileSize($request->input('size'));

        if ($fileName === '' || strlen($fileName) > 180) {
            throw new RuntimeException('INVALID_FILE');
        }

        $extension = strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION));
        if (! isset(self::MIME_EXTENSIONS[$contentType]) || ! in_array($extension, self::MIME_EXTENSIONS[$contentType], true)) {
            throw new RuntimeException('INVALID_FILE');
        }

        $property = $this->properties->getProperty($propertyId);
        if (! $property) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! $this->canManageMedia($admin, $property)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }
        if (count($property['photos'] ?? []) >= 40) {
            return response()->json(['error' => 'PHOTO_LIMIT_REACHED'], 409);
        }

        $storagePath = 'gisley/properties/'.$propertyId.'/'.Str::uuid().'-'.$this->storage->safeFileName($fileName);

        return response()->json([
            'uploadUrl' => $this->storage->presignPut($storagePath, $contentType),
            'storagePath' => $storagePath,
            'assetUrl' => $this->storage->assetUrl($storagePath),
            'provider' => 'r2',
            'uploadHeaders' => ['Content-Type' => $contentType, 'If-None-Match' => '*'],
        ]);
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
        if (count($property['photos'] ?? []) >= 40) {
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
            || $sortOrder < 0 || $sortOrder > 39 || ! isset(self::MIME_EXTENSIONS[$contentType])
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

        $invalid = (
            ! is_int($metadata['size'])
            || $metadata['size'] !== $size
            || $metadata['size'] > 12 * 1024 * 1024
        ) || (
            ! is_string($metadata['contentType'])
            || strtolower($metadata['contentType']) !== $contentType
        ) || ! $this->storage->looksLikeImage($storagePath, $contentType);

        if ($invalid) {
            try {
                $this->storage->delete($storagePath);
            } catch (\Throwable) {
            }
            throw new RuntimeException('INVALID_ASSET');
        }

        $photoId = (string) Str::uuid();
        try {
            $photos = $this->properties->addPhoto([
                'id' => $photoId,
                'property_id' => $propertyId,
                'storage_path' => $storagePath,
                'url' => $this->storage->assetUrl($storagePath),
                'alt_text' => $altText !== '' ? $altText : 'Foto de '.$property['title'],
                'sort_order' => $sortOrder,
                'is_cover' => $isCover ? 1 : 0,
                'storage_provider' => 'r2',
                'mime_type' => $contentType,
                'file_size' => $size,
                'width' => $width,
                'height' => $height,
                'uploaded_by' => $admin['email'],
            ], ! $this->access->hasCapability($admin, 'property.publish'));
        } catch (\Throwable $error) {
            if ($error->getMessage() !== 'ASSET_ALREADY_REGISTERED') {
                try {
                    $this->storage->delete($storagePath);
                } catch (\Throwable) {
                }
            }
            throw $error;
        }

        $this->audit($admin, 'photo.add', 'photo', $photoId, [
            'propertyId' => $propertyId, 'storagePath' => $storagePath,
        ]);

        return response()->json(['photos' => $this->adminPhotos($photos)], 201);
    }

    public function photoMedia(string $id): RedirectResponse|JsonResponse
    {
        $this->assertId($id);
        $photo = $this->properties->getPhoto($id);
        if (! $photo) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return redirect()->away($this->storage->presignGet((string) $photo['storage_path']), 307)
            ->header('Cache-Control', 'no-store');
    }

    public function removePhoto(Request $request, string $id)
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

        $removed = $this->properties->removePhoto(
            $id,
            ! $this->access->hasCapability($admin, 'property.publish')
        );
        if (! $removed) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        try {
            $this->storage->delete((string) $removed['storage_path']);
        } catch (\Throwable $error) {
            report($error);
        }
        $this->audit($admin, 'photo.remove', 'photo', $id, ['propertyId' => $removed['property_id']]);

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

        $photos = $this->properties->reorderPhotos(
            $propertyId,
            array_values(array_map('strval', $photoIds)),
            ! $this->access->hasCapability($admin, 'property.publish')
        );
        $this->audit($admin, 'photo.reorder', 'property', $propertyId, ['photoCount' => count($photos)]);

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

        $photos = $this->properties->setCover(
            $id,
            ! $this->access->hasCapability($admin, 'property.publish')
        );
        if (! $photos) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $this->audit($admin, 'photo.cover', 'photo', $id);

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

    private function admin(Request $request): array
    {
        $admin = $request->attributes->get('admin');
        if (! is_array($admin)) {
            throw new RuntimeException('AUTH_REQUIRED');
        }

        return $admin;
    }

    private function audit(array $admin, string $action, string $type, ?string $id = null, ?array $details = null): void
    {
        try {
            $this->crm->recordAudit($admin, $action, $type, $id, $details);
        } catch (\Throwable $error) {
            report($error);
        }
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

        if ($size < 1 || $size > 12 * 1024 * 1024) {
            throw new RuntimeException('INVALID_FILE');
        }

        return $size;
    }

    private function assertId(string $id): string
    {
        if (! Str::isUuid($id)) {
            throw new RuntimeException('NOT_FOUND');
        }

        return $id;
    }
}
