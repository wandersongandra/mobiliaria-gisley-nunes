<?php

namespace App\Support;

final class ReleaseMetadata
{
    /**
     * Read a private deploy manifest instead of trusting a potentially stale
     * OPcache copy of Laravel's generated configuration cache.
     *
     * @param  array{sha: string, built_at: string, asset_version: string}  $fallback
     * @return array{sha: string, built_at: string, asset_version: string}
     */
    public static function fromManifest(string $path, array $fallback): array
    {
        if (is_link($path) || ! is_file($path) || ! is_readable($path)) {
            return $fallback;
        }

        $body = @file_get_contents($path, false, null, 0, 512);
        if (! is_string($body) || strlen($body) === 512) {
            return $fallback;
        }

        $release = json_decode($body, true);
        if (! is_array($release)) {
            return $fallback;
        }

        $sha = $release['sha'] ?? null;
        $builtAt = $release['built_at'] ?? null;
        $assetVersion = $release['asset_version'] ?? null;

        if (! is_string($sha) || ! preg_match('/\A[0-9a-f]{40}\z/D', $sha)
            || ! is_string($builtAt) || ! preg_match('/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\z/D', $builtAt)
            || ! is_string($assetVersion) || $assetVersion !== substr($sha, 0, 12)) {
            return $fallback;
        }

        return [
            'sha' => $sha,
            'built_at' => $builtAt,
            'asset_version' => $assetVersion,
        ];
    }
}
