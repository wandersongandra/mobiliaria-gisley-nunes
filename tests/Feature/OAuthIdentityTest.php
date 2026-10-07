<?php

namespace Tests\Feature;

use App\Services\AdminAccessService;
use App\Services\AdminIdentityService;
use App\Support\Clock;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
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
        $this->fakeOAuthIdentity(['email_verified' => true]);

        $state = $this->beginLogin();

        $this->get('/api/auth/callback?'.http_build_query([
            'code' => 'valid-auth-code',
            'state' => $state,
        ]))
            ->assertForbidden()
            ->assertSee('Código de vinculação temporário');
    }

    public function test_login_builds_google_authorization_request_with_the_public_callback(): void
    {
        config([
            'app.admin_url' => 'https://www.gisleynunesimoveis.com.br',
            'services.google_oauth.client_id' => 'client-id.apps.googleusercontent.com',
            'services.google_oauth.client_secret' => 'test-client-secret',
        ]);

        $response = $this->get('/api/auth/login');
        $location = (string) $response->headers->get('Location');
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $response->assertRedirect();
        $this->assertSame('accounts.google.com', parse_url($location, PHP_URL_HOST));
        $this->assertSame('client-id.apps.googleusercontent.com', $query['client_id'] ?? null);
        $this->assertSame('https://www.gisleynunesimoveis.com.br/oauth/google/return', $query['redirect_uri'] ?? null);
        $this->assertSame('code', $query['response_type'] ?? null);
        $this->assertSame('openid email profile', $query['scope'] ?? null);
    }

    public function test_login_can_use_neutral_callback_path_for_host_waf_compatibility(): void
    {
        config([
            'app.admin_url' => 'https://painel.gisleynunesimoveis.com.br',
            'services.google_oauth.client_id' => 'client-id.apps.googleusercontent.com',
            'services.google_oauth.client_secret' => 'test-client-secret',
            'services.google_oauth.redirect_path' => '/oauth/google/return',
        ]);

        $response = $this->get('/api/auth/login');
        $location = (string) $response->headers->get('Location');
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $response->assertRedirect();
        $this->assertSame(
            'https://painel.gisleynunesimoveis.com.br/oauth/google/return',
            $query['redirect_uri'] ?? null
        );
    }

    public function test_neutral_callback_path_uses_the_same_oauth_flow(): void
    {
        config(['services.google_oauth.redirect_path' => '/oauth/google/return']);
        $this->fakeOAuthIdentity(['email_verified' => true]);

        $state = $this->beginLogin();

        $this->get('/oauth/google/return?'.http_build_query([
            'code' => 'valid-auth-code',
            'state' => $state,
        ]))
            ->assertForbidden()
            ->assertSee('Código de vinculação temporário');
    }

    #[DataProvider('invalidIdentityClaims')]
    public function test_callback_rejects_malformed_identity_claims(array $claims): void
    {
        $this->fakeOAuthIdentity($claims);
        $state = $this->beginLogin();

        $this->get('/api/auth/callback?'.http_build_query([
            'code' => 'valid-auth-code',
            'state' => $state,
        ]))
            ->assertBadRequest()
            ->assertSee('Não foi possível concluir o acesso.');

        $this->assertDatabaseCount('morada_identity_pairings', 0);
    }

    public static function unverifiedEmailClaims(): array
    {
        return [
            'claim ausente' => [[]],
            'claim nula' => [['email_verified' => null]],
            'claim falsa' => [['email_verified' => false]],
            'claim não booleana' => [['email_verified' => 'true']],
        ];
    }

    public static function invalidIdentityClaims(): array
    {
        return [
            'e-mail inválido' => [['email' => 'not-an-email', 'email_verified' => true]],
            'subject vazio' => [['sub' => '', 'email_verified' => true]],
        ];
    }

    public function test_distinct_subjects_with_the_same_email_never_link_accounts_implicitly(): void
    {
        $identities = app(AdminIdentityService::class);
        $first = $identities->resolve($this->identity('first-subject', 'same@example.test'));
        $second = $identities->resolve($this->identity('second-subject', 'same@example.test'));

        $this->assertNotSame($first['userId'], $second['userId']);
        $this->assertDatabaseCount('morada_users', 2);
        $this->assertDatabaseCount('morada_oauth_identities', 2);
    }

    public function test_same_provider_subject_updates_the_verified_email_without_creating_another_account(): void
    {
        $identities = app(AdminIdentityService::class);
        $first = $identities->resolve($this->identity('stable-subject', 'before@example.test'));
        $second = $identities->resolve($this->identity('stable-subject', 'after@example.test'));

        $this->assertSame($first['userId'], $second['userId']);
        $this->assertDatabaseCount('morada_users', 1);
        $this->assertDatabaseHas('morada_oauth_identities', [
            'id' => $first['identityId'],
            'provider_email' => 'after@example.test',
        ]);
    }

    public function test_new_session_references_user_and_identity_and_blocked_users_are_denied(): void
    {
        $identity = $this->identity('session-subject', 'session@example.test');
        $request = Request::create('/');
        $request->setLaravelSession($this->app['session']->driver());
        $access = app(AdminAccessService::class);
        $admin = $access->establish($request, $identity, 'editor');

        DB::table('morada_staff_access')->insert([
            'email' => $admin['email'],
            'open_id' => $admin['openId'],
            'name' => $admin['name'],
            'role' => 'editor',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $session = DB::table('morada_admin_sessions')->where('user_id', $admin['userId'])->first();
        $this->assertNotNull($session);
        $this->assertSame($admin['identityId'], $session->oauth_identity_id);
        $this->assertNotNull($access->current($request));

        DB::table('morada_users')->where('id', $admin['userId'])->update(['blocked_at' => now()]);
        $this->assertNull($access->current($request));
        $this->assertNotNull(
            DB::table('morada_admin_sessions')->where('jti', $session->jti)->value('revoked_at')
        );
    }

    public function test_sessions_cannot_reference_a_nonexistent_user(): void
    {
        $this->expectException(QueryException::class);

        DB::table('morada_admin_sessions')->insert([
            'jti' => (string) Str::uuid(),
            'user_id' => (string) Str::uuid(),
            'open_id' => 'invalid-subject',
            'email' => 'invalid@example.test',
            'expires_at_ms' => Clock::nowMs() + 60_000,
            'last_seen_at_ms' => Clock::nowMs(),
            'created_at' => now(),
        ]);
    }

    /** @return array{provider: string, providerSubject: string, email: string, name: string, openId: string} */
    private function identity(string $subject, string $email): array
    {
        return [
            'provider' => 'google',
            'providerSubject' => $subject,
            'openId' => $subject,
            'email' => $email,
            'name' => 'Teste OAuth',
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
            'services.google_oauth.client_id' => 'client-id.apps.googleusercontent.com',
            'services.google_oauth.client_secret' => 'test-client-secret',
        ]);

        Http::preventStrayRequests();
        Http::fakeSequence()
            ->push(['access_token' => 'test-access-token', 'token_type' => 'Bearer'])
            ->push(array_merge([
                'email' => 'corretor@example.test',
                'sub' => 'oauth-user-123',
                'name' => 'Corretor Teste',
            ], $claims));
    }
}
