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
        $this->fakeOAuthIdentity(['emailVerified' => true]);

        $state = $this->beginLogin();

        $this->get('/api/auth/callback?'.http_build_query([
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
            'claim nula' => [['emailVerified' => null]],
            'claim falsa' => [['emailVerified' => false]],
            'claim não booleana' => [['emailVerified' => 'true']],
        ];
    }

    public static function invalidIdentityClaims(): array
    {
        return [
            'e-mail inválido' => [['email' => 'not-an-email', 'emailVerified' => true]],
            'open id vazio' => [['openId' => '', 'emailVerified' => true]],
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
            'provider' => 'manus',
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
