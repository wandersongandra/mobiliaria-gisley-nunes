<?php

namespace App\Services;

use Aws\S3\S3Client;
use RuntimeException;

class R2Storage
{
    /**
     * Prefixo de todo objeto de imóvel no bucket. Pertence a esta classe porque
     * é ela quem valida caminhos e confere posse em belongsToProperty().
     */
    public const PREFIX = 'gisley/properties/';

    private function configured(): bool
    {
        $config = config('services.r2');

        return ! empty($config['account_id'])
            && ! empty($config['bucket'])
            && ! empty($config['access_key_id'])
            && ! empty($config['secret_access_key']);
    }

    private function client(): S3Client
    {
        if (! $this->configured()) {
            throw new RuntimeException('STORAGE_NOT_CONFIGURED');
        }

        $config = config('services.r2');

        return new S3Client([
            'version' => 'latest',
            'region' => 'auto',
            'endpoint' => 'https://'.$config['account_id'].'.r2.cloudflarestorage.com',
            'use_path_style_endpoint' => true,
            'credentials' => [
                'key' => $config['access_key_id'],
                'secret' => $config['secret_access_key'],
            ],
        ]);
    }

    public function safeFileName(string $value): string
    {
        $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
        $value = preg_replace('/[^a-zA-Z0-9._-]+/', '-', $value) ?: 'imagem';
        $value = preg_replace('/-+/', '-', $value) ?: $value;
        $value = trim($value, '-.');

        return substr($value !== '' ? $value : 'imagem', 0, 100);
    }

    public function assertKey(string $path): string
    {
        $key = ltrim(substr($path, 0, 500), '/');

        if (! str_starts_with($key, self::PREFIX) || str_contains($key, '..') || str_contains($key, "\0")) {
            throw new RuntimeException('INVALID_ASSET');
        }

        return $key;
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

    public function assetUrl(string $path): string
    {
        $key = $this->assertKey($path);

        return '/media/'.implode('/', array_map('rawurlencode', explode('/', $key)));
    }

    public function presignPut(string $path, string $contentType): string
    {
        $key = $this->assertKey($path);
        $client = $this->client();

        $command = $client->getCommand('PutObject', [
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
            'ContentType' => strtolower(trim($contentType)),
            'IfNoneMatch' => '*',
        ]);

        $request = $client->createPresignedRequest(
            $command,
            '+'.max(60, min(3600, (int) config('services.r2.upload_expires', 600))).' seconds'
        );

        return (string) $request->getUri();
    }

    public function listPropertyObjects(?string $continuationToken = null): array
    {
        $params = [
            'Bucket' => config('services.r2.bucket'),
            'Prefix' => self::PREFIX,
            'MaxKeys' => 1000,
        ];
        if ($continuationToken !== null) {
            $params['ContinuationToken'] = $continuationToken;
        }

        $result = $this->client()->listObjectsV2($params);
        $objects = [];
        foreach ($result['Contents'] ?? [] as $object) {
            $key = isset($object['Key']) ? $this->assertKey((string) $object['Key']) : '';
            $lastModified = $object['LastModified'] ?? null;
            if ($key !== '' && $lastModified instanceof \DateTimeInterface) {
                $objects[] = [
                    'key' => $key,
                    'last_modified' => $lastModified,
                ];
            }
        }

        $nextToken = null;
        if ((bool) ($result['IsTruncated'] ?? false)) {
            $nextToken = $result['NextContinuationToken'] ?? null;
            if (! is_string($nextToken) || $nextToken === '') {
                throw new RuntimeException('STORAGE_PAGINATION_INVALID');
            }
        }

        return ['objects' => $objects, 'next_token' => $nextToken];
    }

    public function presignGet(string $path, int $seconds = 60): string
    {
        $key = $this->assertKey($path);
        $client = $this->client();

        $command = $client->getCommand('GetObject', [
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
        ]);

        return (string) $client
            ->createPresignedRequest($command, '+'.max(30, min(600, $seconds)).' seconds')
            ->getUri();
    }

    public function metadata(string $path): array
    {
        $key = $this->assertKey($path);

        try {
            $result = $this->client()->headObject([
                'Bucket' => config('services.r2.bucket'),
                'Key' => $key,
            ]);
        } catch (\Throwable) {
            return ['exists' => false, 'size' => null, 'contentType' => null];
        }

        return [
            'exists' => true,
            'size' => isset($result['ContentLength']) ? (int) $result['ContentLength'] : null,
            'contentType' => isset($result['ContentType'])
                ? strtolower(trim(explode(';', (string) $result['ContentType'])[0]))
                : null,
        ];
    }

    public function delete(string $path): void
    {
        $key = $this->assertKey($path);

        $this->client()->deleteObject([
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
        ]);
    }

    public function looksLikeImage(string $path, string $contentType): bool
    {
        $key = $this->assertKey($path);

        try {
            $result = $this->client()->getObject([
                'Bucket' => config('services.r2.bucket'),
                'Key' => $key,
                'Range' => 'bytes=0-31',
            ]);
            $bytes = (string) $result['Body'];
        } catch (\Throwable) {
            return false;
        }

        $type = strtolower($contentType);

        return match ($type) {
            'image/jpeg' => strlen($bytes) >= 3
                && ord($bytes[0]) === 0xFF
                && ord($bytes[1]) === 0xD8
                && ord($bytes[2]) === 0xFF,
            'image/png' => str_starts_with($bytes, "\x89PNG\r\n\x1a\n"),
            'image/webp' => strlen($bytes) >= 12
                && substr($bytes, 0, 4) === 'RIFF'
                && substr($bytes, 8, 4) === 'WEBP',
            'image/avif' => strlen($bytes) >= 16
                && substr($bytes, 4, 4) === 'ftyp'
                && (str_contains(substr($bytes, 8, 24), 'avif') || str_contains(substr($bytes, 8, 24), 'avis')),
            default => false,
        };
    }
}
