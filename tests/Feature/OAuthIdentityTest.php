<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OAuthIdentityTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('unverifiedEmailClaims')]
    public function test_callback_rejects_missing_or_unverified_email_claim(array $claims): void
    {
        $this->fakeOAuthIdentity($claims);

        $state = $this->beginLogin();

        $this->get('/api/auth/callback?'.http_build_query([
            'code' => 'valid-auth-code',
            'state' => $state,
        ]))
            ->assertForbidden()
            ->assertSee('e-mail verificado');
    }

    public function test_verified_email_can_continue_to_staff_pairing(): void
    {
        $this->fakeOAuthIdentity(['emailVerified' => true]);

        $state = $this->beginLogin();

        $this->get('/api/auth/callback?'.http_build_query([
            'code' => 'valid-auth-code',
            'state' => $state,
        ]))
            ->assertForbidden()
            ->assertSee('Código de vinculação temporário');
    }

    public static function unverifiedEmailClaims(): array
    {
        return [
            'claim ausente' => [[]],
            'claim nula' => [['emailVerified' => null]],
            'claim falsa' => [['emailVerified' => false]],
        ];
    }

    private function beginLogin(): string
    {
        $this->get('/api/auth/login')->assertRedirect();

        return (string) $this->app['session.store']->get('oauth_state');
    }

    private function fakeOAuthIdentity(array $claims): void
    {
        config([
            'services.manus_oauth.portal_url' => 'https://oauth.example.test',
            'services.manus_oauth.api_url' => 'https://oauth-api.example.test',
            'services.manus_oauth.project_id' => 'gisley-test',
        ]);

        Http::preventStrayRequests();
        Http::fakeSequence()
            ->push(['accessToken' => 'test-access-token'])
            ->push(array_merge([
                'email' => 'corretor@example.test',
                'openId' => 'oauth-user-123',
                'name' => 'Corretor Teste',
            ], $claims));
    }
}
