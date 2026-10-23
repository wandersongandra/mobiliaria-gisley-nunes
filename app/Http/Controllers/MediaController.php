<?php

namespace App\Http\Controllers;

use App\Services\PropertyService;
use App\Services\R2Storage;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MediaController extends Controller
{
    public function __construct(
        private readonly PropertyService $properties,
        private readonly R2Storage $storage,
    ) {}

    public function media(string $path): BinaryFileResponse|JsonResponse
    {
        $key = rawurldecode($path);
        if (! $this->properties->findPublishedPhotoByStoragePath($key)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        if (! $this->storage->exists($key)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->file($this->storage->path($key), [
            'Content-Type' => $this->storage->contentType($key),
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
