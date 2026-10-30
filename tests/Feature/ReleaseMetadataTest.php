<?php

namespace Tests\Feature;

use App\Support\ReleaseMetadata;
use PHPUnit\Framework\TestCase;

class ReleaseMetadataTest extends TestCase
{
    private const SHA = '0123456789abcdef0123456789abcdef01234567';

    public function test_valid_private_manifest_overrides_stale_cached_configuration(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'release-metadata-');
        self::assertIsString($path);

        try {
            file_put_contents($path, json_encode([
                'sha' => self::SHA,
                'built_at' => '2026-10-30T01:00:00Z',
                'asset_version' => '0123456789ab',
            ], JSON_THROW_ON_ERROR));

            self::assertSame([
                'sha' => self::SHA,
                'built_at' => '2026-10-30T01:00:00Z',
                'asset_version' => '0123456789ab',
            ], ReleaseMetadata::fromManifest($path, $this->fallback()));
        } finally {
            unlink($path);
        }
    }

    public function test_missing_or_invalid_manifest_keeps_legacy_config_values(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'release-metadata-');
        self::assertIsString($path);

        try {
            foreach ([
                'not json',
                json_encode(['sha' => self::SHA, 'built_at' => '2026-10-30T01:00:00Z', 'asset_version' => 'wrong']),
                json_encode(['sha' => '../private', 'built_at' => '2026-10-30T01:00:00Z', 'asset_version' => '0123456789ab']),
                str_repeat('x', 512),
            ] as $invalid) {
                file_put_contents($path, $invalid);
                self::assertSame($this->fallback(), ReleaseMetadata::fromManifest($path, $this->fallback()));
            }
        } finally {
            unlink($path);
        }

        self::assertSame($this->fallback(), ReleaseMetadata::fromManifest($path, $this->fallback()));
    }

    /** @return array{sha: string, built_at: string, asset_version: string} */
    private function fallback(): array
    {
        return ['sha' => 'unknown', 'built_at' => 'unknown', 'asset_version' => 'unknown'];
    }
}
