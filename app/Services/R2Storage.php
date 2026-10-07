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

    /**
     * Limita a alocação potencial do decoder ao conferir a área antes de a
     * imagem ser persistida como mídia pública. O limite lateral isolado não
     * protege contra arquivos com muitos pixels.
     */
    private const MAX_IMAGE_PIXELS = 40_000_000;

    private const IMAGE_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
    ];

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
        if ($path === '' || strlen($path) > 500 || str_starts_with($path, '/')) {
            throw new RuntimeException('INVALID_ASSET');
        }

        $key = $path;
        if (
            ! str_starts_with($key, self::PREFIX)
            || str_contains($key, "\\")
            || str_contains($key, '//')
            || preg_match('/[\x00-\x1F\x7F]/', $key) === 1
            || preg_match('#^[A-Za-z0-9._/-]+$#D', $key) !== 1
        ) {
            throw new RuntimeException('INVALID_ASSET');
        }

        foreach (explode('/', $key) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new RuntimeException('INVALID_ASSET');
            }
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
        $contentType = strtolower(trim($contentType));
        if (! in_array($contentType, self::IMAGE_MIME_TYPES, true)) {
            throw new RuntimeException('INVALID_FILE');
        }

        $client = $this->client();

        $command = $client->getCommand('PutObject', [
            'Bucket' => config('services.r2.bucket'),
            'Key' => $key,
            'ContentType' => $contentType,
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

    /**
     * Lê a imagem armazenada para validar o formato e as dimensões reais. Os
     * valores declarados pelo navegador nunca são persistidos sem esta prova.
     * O controller chama metadata() antes deste método e limita o objeto a 12 MB.
     *
     * @return array{width: int, height: int, mime: string}|null
     */
    public function imageInfo(string $path, string $contentType): ?array
    {
        $key = $this->assertKey($path);

        try {
            $result = $this->client()->getObject([
                'Bucket' => config('services.r2.bucket'),
                'Key' => $key,
            ]);
            $bytes = (string) $result['Body'];
        } catch (\Throwable) {
            return null;
        }

        return self::imageInfoFromBytes($bytes, $contentType);
    }

    /**
     * @return array{width: int, height: int, mime: string}|null
     */
    public static function imageInfoFromBytes(string $bytes, string $contentType): ?array
    {
        if ($bytes === '' || strlen($bytes) > 12 * 1024 * 1024) {
            return null;
        }

        $details = @getimagesizefromstring($bytes);
        if ($details === false) {
            return null;
        }

        $actualMime = strtolower($details['mime']);
        $expectedMime = strtolower(trim($contentType));
        $width = $details[0];
        $height = $details[1];

        if (! in_array($actualMime, self::IMAGE_MIME_TYPES, true)
            || ! hash_equals($expectedMime, $actualMime)
            || $width < 1 || $width > 20_000 || $height < 1 || $height > 20_000
            || ($width * $height) > self::MAX_IMAGE_PIXELS) {
            return null;
        }

        return ['width' => $width, 'height' => $height, 'mime' => $actualMime];
    }
}
