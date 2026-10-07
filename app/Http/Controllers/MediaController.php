<?php

namespace App\Http\Controllers;

use App\Services\PropertyService;
use App\Services\R2Storage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

class MediaController extends Controller
{
    public function __construct(
        private readonly PropertyService $properties,
        private readonly R2Storage $storage,
    ) {}

    public function media(string $path): RedirectResponse|JsonResponse
    {
        $key = rawurldecode($path);
        if (! $this->properties->findPublishedPhotoByStoragePath($key)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return redirect()->away($this->storage->presignGet($key), 307)
            ->header('Cache-Control', 'no-store');
    }
}
