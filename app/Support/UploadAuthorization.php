<?php

namespace App\Support;

use Illuminate\Support\Facades\Crypt;
use RuntimeException;

/**
 * Vincula a autorização de upload ao arquivo, sessão e prazo emitidos no presign.
 * O storage usa criação exclusiva (xb), impedindo reuso da mesma autorização
 * para sobrescrever um arquivo já enviado.
 */
final class UploadAuthorization
{
    private const TTL_MS = 10 * 60 * 1000;

    public static function issue(string $path, string $mime, int $size, array $admin): string
    {
        $actor = (string) ($admin['openId'] ?? '');
        $session = (string) ($admin['sessionJti'] ?? '');
        if ($actor === '' || $session === '') {
            throw new RuntimeException('AUTH_REQUIRED');
        }

        return Crypt::encryptString(json_encode([
            'v' => 1,
            'path' => $path,
            'mime' => $mime,
            'size' => $size,
            'actor' => $actor,
            'session' => $session,
            'expires_at_ms' => Clock::nowMs() + self::TTL_MS,
        ], JSON_THROW_ON_ERROR));
    }

    public static function assertValid(?string $token, string $path, string $mime, int $size, array $admin): void
    {
        if (! is_string($token) || $token === '' || strlen($token) > 4096) {
            throw new RuntimeException('UPLOAD_AUTH_REQUIRED');
        }

        try {
            $claims = json_decode(Crypt::decryptString($token), true, 8, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new RuntimeException('UPLOAD_AUTH_INVALID');
        }

        $now = Clock::nowMs();
        if (! is_array($claims)
            || ($claims['v'] ?? null) !== 1
            || ! is_int($claims['size'] ?? null)
            || $claims['size'] !== $size
            || ! is_int($claims['expires_at_ms'] ?? null)
            || $claims['expires_at_ms'] < $now
            || $claims['expires_at_ms'] > $now + self::TTL_MS
            || ! self::matches($path, $claims['path'] ?? null)
            || ! self::matches($mime, $claims['mime'] ?? null)
            || ! self::matches((string) ($admin['openId'] ?? ''), $claims['actor'] ?? null)
            || ! self::matches((string) ($admin['sessionJti'] ?? ''), $claims['session'] ?? null)
        ) {
            throw new RuntimeException('UPLOAD_AUTH_INVALID');
        }
    }

    private static function matches(string $expected, mixed $actual): bool
    {
        return $expected !== '' && is_string($actual) && hash_equals($expected, $actual);
    }

    private function __construct() {}
}
