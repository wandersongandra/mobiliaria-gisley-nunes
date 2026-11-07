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

        $mime = $this->storage->contentType($key);
        if (! R2Storage::isSupportedImageContentType($mime)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->file($this->storage->path($key), [
            'Content-Type' => $mime,
            // A disponibilidade comercial pode mudar sem alterar a URL da foto.
            // URLs imutáveis por um ano impediriam a retirada efetiva do anúncio.
            'Cache-Control' => 'public, max-age=300, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
