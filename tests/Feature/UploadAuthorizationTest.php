<?php

namespace Tests\Feature;

use App\Support\UploadAuthorization;
use Illuminate\Support\Carbon;
use RuntimeException;
use Tests\TestCase;

class UploadAuthorizationTest extends TestCase
{
    private const PATH = 'gisley/properties/00000000-0000-4000-8000-000000000001/photo.jpg';

    private const ADMIN = ['openId' => 'google-subject-123', 'sessionJti' => 'session-456'];

    public function test_valid_authorization_is_bound_to_the_exact_upload(): void
    {
        $token = UploadAuthorization::issue(self::PATH, 'image/jpeg', 1024, self::ADMIN);

        UploadAuthorization::assertValid($token, self::PATH, 'image/jpeg', 1024, self::ADMIN);
        $this->assertNotSame('', $token);
    }

    public function test_rejects_missing_or_tampered_authorization(): void
    {
        $token = UploadAuthorization::issue(self::PATH, 'image/jpeg', 1024, self::ADMIN);

        foreach ([null, '', $token.'tampered'] as $invalid) {
            try {
                UploadAuthorization::assertValid($invalid, self::PATH, 'image/jpeg', 1024, self::ADMIN);
                $this->fail('Missing or altered upload authorization was accepted.');
            } catch (RuntimeException $error) {
                $this->assertContains($error->getMessage(), ['UPLOAD_AUTH_REQUIRED', 'UPLOAD_AUTH_INVALID']);
            }
        }
    }

    public function test_rejects_different_path_mime_size_actor_and_session(): void
    {
        $token = UploadAuthorization::issue(self::PATH, 'image/jpeg', 1024, self::ADMIN);
        $cases = [
            [self::PATH.'-other', 'image/jpeg', 1024, self::ADMIN],
            [self::PATH, 'image/png', 1024, self::ADMIN],
            [self::PATH, 'image/jpeg', 1025, self::ADMIN],
            [self::PATH, 'image/jpeg', 1024, ['openId' => 'other', 'sessionJti' => 'session-456']],
            [self::PATH, 'image/jpeg', 1024, ['openId' => 'google-subject-123', 'sessionJti' => 'other']],
        ];

        foreach ($cases as [$path, $mime, $size, $admin]) {
            try {
                UploadAuthorization::assertValid($token, $path, $mime, $size, $admin);
                $this->fail('An upload authorization was accepted for different claims.');
            } catch (RuntimeException $error) {
                $this->assertSame('UPLOAD_AUTH_INVALID', $error->getMessage());
            }
        }
    }

    public function test_expired_authorization_is_rejected(): void
    {
        Carbon::setTestNow('2026-10-29 10:00:00');
        try {
            $token = UploadAuthorization::issue(self::PATH, 'image/jpeg', 1024, self::ADMIN);
            Carbon::setTestNow('2026-10-29 10:11:00');

            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('UPLOAD_AUTH_INVALID');
            UploadAuthorization::assertValid($token, self::PATH, 'image/jpeg', 1024, self::ADMIN);
        } finally {
            Carbon::setTestNow();
        }
    }
}
