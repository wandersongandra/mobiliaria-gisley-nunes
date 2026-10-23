<?php

namespace App\Services;

use DateTimeImmutable;
use FilesystemIterator;
use Illuminate\Support\Str;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;

/**
 * Armazena novas fotos em storage/app/private/media (ou MEDIA_ROOT).
 *
 * Os caminhos preservam o namespace histórico `gisley/properties/{id}` para
 * manter o contrato do banco. Objetos que ainda existem somente no R2 não são
 * migrados automaticamente e continuarão indisponíveis até cópia física para
 * MEDIA_ROOT.
 */
class LocalMediaStorage
{
    public const PREFIX = 'gisley/properties/';

    private const MAX_IMAGE_PIXELS = 40_000_000;

    private const MAX_FILE_SIZE = 12 * 1024 * 1024;

    private const IMAGE_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
    ];

    public function safeFileName(string $value): string
    {
        if (function_exists('iconv')) {
            $transliterated = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
            if (is_string($transliterated) && $transliterated !== '') {
                $value = $transliterated;
            }
        }
        $value = preg_replace('/[^a-zA-Z0-9._-]+/', '-', $value) ?: 'imagem';
        $value = preg_replace('/-+/', '-', $value) ?: $value;
        $value = trim($value, '-.');

        return substr($value !== '' ? $value : 'imagem', 0, 100);
    }

    public function assertKey(string $path): string
    {
        if ($path === '' || strlen($path) > 500 || str_starts_with($path, '/')) {
            throw new RuntimeException('INVALID_ASSET');
        }

        if (
            ! str_starts_with($path, self::PREFIX)
            || str_contains($path, '\\')
            || str_contains($path, '//')
            || preg_match('/[\x00-\x1F\x7F]/', $path) === 1
            || preg_match('#^[A-Za-z0-9._/-]+$#D', $path) !== 1
        ) {
            throw new RuntimeException('INVALID_ASSET');
        }

        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new RuntimeException('INVALID_ASSET');
            }
        }

        return $path;
    }

    public function belongsToProperty(string $path, string $propertyId): bool
    {
        try {
            $key = $this->assertKey($path);
        } catch (RuntimeException) {
            return false;
        }

        return $propertyId !== ''
            && ! str_contains($propertyId, '/')
            && ! str_contains($propertyId, '\\')
            && str_starts_with($key, self::PREFIX.$propertyId.'/');
    }

    public function propertyIdFromPath(string $path): ?string
    {
        try {
            $key = $this->assertKey($path);
        } catch (RuntimeException) {
            return null;
        }

        $prefix = self::PREFIX;
        if (! str_starts_with($key, $prefix)) {
            return null;
        }

        $remaining = substr($key, strlen($prefix));
        $propertyId = explode('/', $remaining, 2)[0] ?? '';

        return $propertyId !== '' ? $propertyId : null;
    }

    public function assetUrl(string $path): string
    {
        $key = $this->assertKey($path);

        return '/media/'.implode('/', array_map('rawurlencode', explode('/', $key)));
    }

    /**
     * Mantém o contrato de presign sem assinar um objeto externo: o upload
     * segue para a rota PUT autenticada da própria aplicação.
     */
    public function presignPut(string $path, string $contentType): string
    {
        $key = $this->assertKey($path);
        $this->assertImageContentType($contentType);

        return '/api/admin/uploads/'.implode('/', array_map('rawurlencode', explode('/', $key)));
    }

    /**
     * Não há URL externa para o disco privado. O endpoint de mídia valida o
     * registro no banco e entrega o arquivo através do controller.
     */
    public function presignGet(string $path, int $seconds = 60): string
    {
        return $this->assetUrl($path);
    }

    public function putFile(string $path, string $filePath, string $contentType, int $size): void
    {
        $this->assertKey($path);
        $this->assertFileInput($filePath, $contentType, $size);

        $stream = fopen($filePath, 'rb');
        if ($stream === false) {
            throw new RuntimeException('INVALID_FILE');
        }

        try {
            $this->putStream($path, $stream, $contentType, $size);
        } finally {
            fclose($stream);
        }
    }

    /**
     * Persiste um corpo PUT em arquivo novo, sem permitir sobrescrita por replay.
     * O chamador permanece responsável por fechar o stream recebido.
     *
     * @param resource $stream
     */
    public function putStream(string $path, $stream, string $contentType, int $size): void
    {
        $key = $this->assertKey($path);
        $this->assertImageContentType($contentType);
        if ($size < 1 || $size > self::MAX_FILE_SIZE || ! is_resource($stream)) {
            throw new RuntimeException('INVALID_FILE');
        }

        $target = $this->pathForKey($key, false);
        $directory = dirname($target);
        if (! is_dir($directory) && ! @mkdir($directory, 0750, true) && ! is_dir($directory)) {
            throw new RuntimeException('MEDIA_STORAGE_NOT_WRITABLE');
        }

        $output = @fopen($target, 'xb');
        if ($output === false) {
            throw new RuntimeException(is_file($target) ? 'ASSET_ALREADY_UPLOADED' : 'MEDIA_STORAGE_NOT_WRITABLE');
        }

        try {
            if (PHP_OS_FAMILY !== 'Windows' && function_exists('chmod') && ! @chmod($target, 0640)) {
                throw new RuntimeException('MEDIA_STORAGE_NOT_WRITABLE');
            }

            $copied = stream_copy_to_stream($stream, $output);
            if ($copied !== $size) {
                throw new RuntimeException('INVALID_FILE');
            }
        } catch (RuntimeException $error) {
            @unlink($target);
            throw $error;
        } catch (\Throwable $error) {
            @unlink($target);
            throw new RuntimeException('MEDIA_STORAGE_WRITE_FAILED', 0, $error);
        } finally {
            fclose($output);
        }
    }

    public function metadata(string $path): array
    {
        try {
            $key = $this->assertKey($path);
            $file = $this->pathForKey($key, false);
        } catch (RuntimeException) {
            return ['exists' => false, 'size' => null, 'contentType' => null];
        }

        if (! is_file($file) || ! is_readable($file)) {
            return ['exists' => false, 'size' => null, 'contentType' => null];
        }

        $mime = function_exists('mime_content_type') ? mime_content_type($file) : false;

        return [
            'exists' => true,
            'size' => filesize($file) ?: 0,
            'contentType' => is_string($mime) ? strtolower(trim(explode(';', $mime)[0])) : null,
        ];
    }

    public function imageInfo(string $path, string $contentType): ?array
    {
        try {
            $file = $this->pathForKey($this->assertKey($path), false);
            $bytes = is_readable($file) ? file_get_contents($file) : false;
        } catch (RuntimeException) {
            return null;
        }

        return $bytes === false ? null : self::imageInfoFromBytes($bytes, $contentType);
    }

    public function exists(string $path): bool
    {
        try {
            $file = $this->pathForKey($this->assertKey($path), false);
        } catch (RuntimeException) {
            return false;
        }

        return is_file($file) && is_readable($file);
    }

    public function path(string $path): string
    {
        $file = $this->pathForKey($this->assertKey($path), false);
        if (! is_file($file) || ! is_readable($file)) {
            throw new RuntimeException('ASSET_NOT_FOUND');
        }

        return $file;
    }

    public function contentType(string $path): string
    {
        $file = $this->path($path);
        $mime = function_exists('mime_content_type') ? mime_content_type($file) : false;

        return is_string($mime) && $mime !== '' ? strtolower(trim(explode(';', $mime)[0])) : 'application/octet-stream';
    }

    public function delete(string $path): void
    {
        try {
            $file = $this->pathForKey($this->assertKey($path), false);
        } catch (RuntimeException $error) {
            if ($error->getMessage() === 'INVALID_ASSET') {
                throw $error;
            }

            return;
        }

        if (is_file($file) && ! @unlink($file)) {
            throw new RuntimeException('MEDIA_STORAGE_DELETE_FAILED');
        }
    }

    /** @return array{objects: list<array{key: string, last_modified: DateTimeImmutable}>, next_token: null} */
    public function listPropertyObjects(?string $continuationToken = null): array
    {
        $root = $this->pathForKey(rtrim(self::PREFIX, '/'), false);
        $objects = [];
        if (is_dir($root)) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                if (! $file->isFile() || $file->isLink()) {
                    continue;
                }

                $relative = str_replace(DIRECTORY_SEPARATOR, '/', $iterator->getSubPathName());
                $key = self::PREFIX.ltrim($relative, '/');
                try {
                    $key = $this->assertKey($key);
                } catch (RuntimeException) {
                    continue;
                }
                $objects[] = [
                    'key' => $key,
                    'last_modified' => new DateTimeImmutable('@'.$file->getMTime()),
                ];
            }
        }

        return ['objects' => $objects, 'next_token' => null];
    }

    /** @return array{width: int, height: int, mime: string}|null */
    public static function imageInfoFromBytes(string $bytes, string $contentType): ?array
    {
        if ($bytes === '' || strlen($bytes) > self::MAX_FILE_SIZE) {
            return null;
        }

        $details = @getimagesizefromstring($bytes);
        if ($details === false) {
            return null;
        }

        $actualMime = strtolower((string) ($details['mime'] ?? ''));
        $expectedMime = strtolower(trim($contentType));
        $width = (int) ($details[0] ?? 0);
        $height = (int) ($details[1] ?? 0);

        if (! in_array($actualMime, self::IMAGE_MIME_TYPES, true)
            || ! hash_equals($expectedMime, $actualMime)
            || $width < 1 || $width > 20_000 || $height < 1 || $height > 20_000
            || ($width * $height) > self::MAX_IMAGE_PIXELS) {
            return null;
        }

        return ['width' => $width, 'height' => $height, 'mime' => $actualMime];
    }

    private function assertImageContentType(string $contentType): string
    {
        $contentType = strtolower(trim($contentType));
        if (! in_array($contentType, self::IMAGE_MIME_TYPES, true)) {
            throw new RuntimeException('INVALID_FILE');
        }

        return $contentType;
    }

    private function assertFileInput(string $filePath, string $contentType, int $size): void
    {
        $this->assertImageContentType($contentType);
        if ($size < 1 || $size > self::MAX_FILE_SIZE || ! is_file($filePath) || ! is_readable($filePath)) {
            throw new RuntimeException('INVALID_FILE');
        }
    }

    private function pathForKey(string $key, bool $mustExist = true): string
    {
        $root = $this->mediaRoot();
        $relative = str_replace('/', DIRECTORY_SEPARATOR, ltrim($key, '/'));
        $candidate = $root.DIRECTORY_SEPARATOR.$relative;
        $rootPrefix = rtrim($root, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        if (! str_starts_with($candidate, $rootPrefix)) {
            throw new RuntimeException('INVALID_ASSET');
        }

        if ($mustExist && ! file_exists($candidate)) {
            throw new RuntimeException('ASSET_NOT_FOUND');
        }

        $existing = realpath($mustExist ? $candidate : dirname($candidate));
        $rootReal = realpath($root);
        if ($rootReal === false || $existing === false) {
            if ($mustExist) {
                throw new RuntimeException('ASSET_NOT_FOUND');
            }

            return $candidate;
        }

        $realPrefix = rtrim($rootReal, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;
        if (! str_starts_with($existing, $realPrefix) && $existing !== $rootReal) {
            throw new RuntimeException('INVALID_ASSET');
        }

        return $candidate;
    }

    private function mediaRoot(): string
    {
        $root = self::configuredMediaRoot();

        if (! is_dir($root) && ! @mkdir($root, 0750, true) && ! is_dir($root)) {
            throw new RuntimeException('MEDIA_STORAGE_NOT_WRITABLE');
        }
        if (! is_writable($root)) {
            throw new RuntimeException('MEDIA_STORAGE_NOT_WRITABLE');
        }

        return rtrim($root, DIRECTORY_SEPARATOR);
    }

    public static function configuredMediaRoot(): string
    {
        $root = trim((string) config('services.media.root', storage_path('app/private/media')));
        if ($root === '') {
            throw new RuntimeException('MEDIA_ROOT_INVALID');
        }

        if (! self::isAbsolutePath($root)) {
            $root = base_path($root);
        }

        $root = self::normalizePath(realpath($root) ?: $root);
        $public = self::normalizePath(realpath(public_path()) ?: public_path());
        $rootForComparison = DIRECTORY_SEPARATOR === '\\' ? strtolower($root) : $root;
        $publicForComparison = DIRECTORY_SEPARATOR === '\\' ? strtolower($public) : $public;

        if ($rootForComparison === $publicForComparison
            || str_starts_with($rootForComparison, $publicForComparison.DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('MEDIA_ROOT_INVALID');
        }

        return rtrim($root, DIRECTORY_SEPARATOR);
    }

    private static function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, '/')
            || str_starts_with($path, '\\')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }

    private static function normalizePath(string $path): string
    {
        $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, trim($path));
        $prefix = '';

        if (DIRECTORY_SEPARATOR === '\\' && str_starts_with($path, '\\\\')) {
            $prefix = '\\\\';
            $path = ltrim($path, '\\');
        } elseif (DIRECTORY_SEPARATOR === '\\' && preg_match('/^[A-Za-z]:\\\\/', $path) === 1) {
            $prefix = substr($path, 0, 3);
            $path = substr($path, 3);
        } elseif (str_starts_with($path, DIRECTORY_SEPARATOR)) {
            $prefix = DIRECTORY_SEPARATOR;
            $path = ltrim($path, DIRECTORY_SEPARATOR);
        }

        $segments = [];
        foreach (explode(DIRECTORY_SEPARATOR, $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }

        $normalized = $prefix.implode(DIRECTORY_SEPARATOR, $segments);

        return $normalized !== '' ? $normalized : ($prefix !== '' ? $prefix : '.');
    }
}
