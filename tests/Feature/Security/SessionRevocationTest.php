<?php

namespace Tests\Feature\Security;

use App\Services\AdminAccessService;
use App\Services\CrmService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

/**
 * Valida revogação atômica de sessões (JTI), reuso inválido de tokens de
 * convite e pairing, e a atomicidade do consumo de desafios de auth.
 */
class SessionRevocationTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    private function createSession(string $openId, string $email): array
    {
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor Teste');
        $userId = $identity['user_id'];
        $identityId = $identity['identity_id'];

        DB::table('morada_staff_access')->insert([
            'email' => strtolower($email),
            'open_id' => $openId,
            'name' => 'Gestor Teste',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $jti = (string) Str::uuid();
        $now = Clock::nowMs();
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'user_id' => $userId,
            'oauth_identity_id' => $identityId,
            'open_id' => $openId,
            'email' => strtolower($email),
            'expires_at_ms' => $now + 3_600_000,
            'last_seen_at_ms' => $now,
            'created_at' => now(),
        ]);

        return [
            'jti' => $jti,
            'user_id' => $userId,
            'identity_id' => $identityId,
            'open_id' => $openId,
            'email' => $email,
        ];
    }

    private function requestWithSession(string $jti): Request
    {
        $request = Request::create('/api/admin/properties', 'GET');
        $request->setLaravelSession(app('session.store'));
        $request->session()->put('admin_jti', $jti);
        $request->session()->put('admin_user_id', 'test');

        return $request;
    }

    public function test_establish_regenerates_the_framework_session_id(): void
    {
        $identity = $this->attachAdminIdentity('session-rotation-sub', 'rotation@example.test', 'Rotação');
        $request = Request::create('/api/auth/callback', 'GET');
        $request->setLaravelSession(app('session.store'));
        $before = $request->session()->getId();

        app(AdminAccessService::class)->establish($request, [
            'provider' => 'google',
            'providerSubject' => 'session-rotation-sub',
            'openId' => 'session-rotation-sub',
            'email' => 'rotation@example.test',
            'name' => 'Rotação',
            'userId' => $identity['user_id'],
            'identityId' => $identity['identity_id'],
        ], 'editor');

        $this->assertNotSame($before, $request->session()->getId());
    }

    // --- Session Revocation ---

    public function test_revoked_session_is_immediately_rejected_with_401(): void
    {
        $session = $this->createSession('revoke-single-sub', 'manager1@example.test');
        $access = app(AdminAccessService::class);

        // Sessão válida — current() retorna o admin.
        $request = $this->requestWithSession($session['jti']);
        $this->assertNotNull($access->current($request));

        // Revoga a sessão.
        $access->revokeCurrent($request);

        // Tentativa de uso imediato — deve retornar null (→ 401 no middleware).
        $request2 = $this->requestWithSession($session['jti']);
        $this->assertNull($access->current($request2), 'Sessão revogada deve ser rejeitada imediatamente.');
    }

    public function test_logout_all_revokes_every_session_for_the_user(): void
    {
        $openId = 'revoke-all-sub';
        $email = 'manager2@example.test';
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor Multi-Session');
        $userId = $identity['user_id'];
        $identityId = $identity['identity_id'];

        DB::table('morada_staff_access')->insert([
            'email' => strtolower($email),
            'open_id' => $openId,
            'name' => 'Gestor Multi-Session',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Cria 3 sessões ativas.
        $jtis = [];
        for ($i = 0; $i < 3; $i++) {
            $jti = (string) Str::uuid();
            $now = Clock::nowMs();
            DB::table('morada_admin_sessions')->insert([
                'jti' => $jti,
                'user_id' => $userId,
                'oauth_identity_id' => $identityId,
                'open_id' => $openId,
                'email' => strtolower($email),
                'expires_at_ms' => $now + 3_600_000,
                'last_seen_at_ms' => $now,
                'created_at' => now(),
            ]);
            $jtis[] = $jti;
        }

        $access = app(AdminAccessService::class);

        // Revoga todas as sessões do usuário.
        $revoked = $access->revokeAll($userId);
        $this->assertSame(3, $revoked, 'revokeAll deve revogar todas as 3 sessões ativas.');

        // Cada JTI deve ser imediatamente rejeitado.
        foreach ($jtis as $jti) {
            $request = $this->requestWithSession($jti);
            $this->assertNull(
                $access->current($request),
                "JTI {$jti} deve ser rejeitado após revokeAll.",
            );
        }
    }

    public function test_expired_session_is_rejected_even_without_explicit_revocation(): void
    {
        $openId = 'expired-session-sub';
        $email = 'manager3@example.test';
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor Expirado');
        $userId = $identity['user_id'];
        $identityId = $identity['identity_id'];

        DB::table('morada_staff_access')->insert([
            'email' => strtolower($email),
            'open_id' => $openId,
            'name' => 'Gestor Expirado',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $jti = (string) Str::uuid();
        $past = Clock::nowMs() - 1_000;
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'user_id' => $userId,
            'oauth_identity_id' => $identityId,
            'open_id' => $openId,
            'email' => strtolower($email),
            'expires_at_ms' => $past,
            'last_seen_at_ms' => $past - 1_000,
            'created_at' => now(),
        ]);

        $request = $this->requestWithSession($jti);
        $this->assertNull(
            app(AdminAccessService::class)->current($request),
            'Sessão expirada deve ser rejeitada.',
        );
    }

    public function test_idle_timeout_revokes_long_inactive_session(): void
    {
        $openId = 'idle-timeout-sub';
        $email = 'manager4@example.test';
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor Idle');
        $userId = $identity['user_id'];
        $identityId = $identity['identity_id'];

        DB::table('morada_staff_access')->insert([
            'email' => strtolower($email),
            'open_id' => $openId,
            'name' => 'Gestor Idle',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $jti = (string) Str::uuid();
        $now = Clock::nowMs();
        // last_seen há 120 minutos, idle_timeout default = 60 minutos.
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'user_id' => $userId,
            'oauth_identity_id' => $identityId,
            'open_id' => $openId,
            'email' => strtolower($email),
            'expires_at_ms' => $now + 3_600_000,
            'last_seen_at_ms' => $now - 120 * 60 * 1000,
            'created_at' => now(),
        ]);

        $request = $this->requestWithSession($jti);
        $this->assertNull(
            app(AdminAccessService::class)->current($request),
            'Sessão inativa além do idle timeout deve ser rejeitada.',
        );
    }

    // --- Auth Challenge: one-time consumption ---

    public function test_auth_challenge_cannot_be_consumed_twice(): void
    {
        $crm = app(CrmService::class);
        $stateHash = hash('sha256', 'test-state-reuse');
        $now = Clock::nowMs();

        $crm->createAuthChallenge(
            $stateHash,
            'https://admin.example.test/oauth/google/return',
            $now + 600_000,
            null,
        );

        // Primeiro consumo — deve retornar o desafio.
        $first = $crm->consumeAuthChallenge($stateHash);
        $this->assertNotNull($first, 'Primeiro consumo do challenge deve funcionar.');

        // Segundo consumo — deve retornar null (desafio já consumido/deletado).
        $second = $crm->consumeAuthChallenge($stateHash);
        $this->assertNull($second, 'Reuso de auth challenge deve ser rejeitado.');
    }

    public function test_expired_auth_challenge_is_rejected(): void
    {
        $crm = app(CrmService::class);
        $stateHash = hash('sha256', 'expired-challenge-state');

        $now = Clock::nowMs();
        $crm->createAuthChallenge(
            $stateHash,
            'https://admin.example.test/oauth/google/return',
            $now - 1,
            null,
        );

        $result = $crm->consumeAuthChallenge($stateHash);
        $this->assertNull($result, 'Auth challenge expirado deve ser rejeitado.');
    }

    // --- Pairing: one-time consumption ---

    public function test_pairing_code_cannot_be_used_twice(): void
    {
        $crm = app(CrmService::class);
        $codeHash = hash('sha256', 'pairing-code-reuse');
        $openId = 'pairing-reuse-sub';
        $email = 'pairing@example.test';
        $now = Clock::nowMs();

        $crm->createPairing($codeHash, $openId, $email, $now + 900_000);

        // Primeiro uso — deve funcionar.
        $first = $crm->bindPairing($codeHash, $email, 'Novo Membro', 'editor', 'manager@example.test');
        $this->assertNotNull($first, 'Primeiro uso do pairing code deve funcionar.');

        // Segundo uso — deve retornar null (pairing já consumido/deletado).
        $second = $crm->bindPairing($codeHash, $email, 'Novo Membro', 'editor', 'manager@example.test');
        $this->assertNull($second, 'Reuso de pairing code deve ser rejeitado.');
    }

    public function test_expired_pairing_code_is_rejected(): void
    {
        $crm = app(CrmService::class);
        $codeHash = hash('sha256', 'expired-pairing-code');
        $openId = 'expired-pairing-sub';
        $email = 'expired-pairing@example.test';
        $now = Clock::nowMs();

        $crm->createPairing($codeHash, $openId, $email, $now - 1);

        $result = $crm->bindPairing($codeHash, $email, 'Membro', 'editor', 'manager@example.test');
        $this->assertNull($result, 'Pairing code expirado deve ser rejeitado.');
    }

    public function test_pairing_email_mismatch_is_rejected(): void
    {
        $crm = app(CrmService::class);
        $codeHash = hash('sha256', 'pairing-mismatch-code');
        $openId = 'mismatch-pairing-sub';
        $email = 'correct@example.test';
        $now = Clock::nowMs();

        $crm->createPairing($codeHash, $openId, $email, $now + 900_000);

        // Tenta usar com email diferente — deve falhar.
        $result = $crm->bindPairing($codeHash, 'wrong@example.test', 'Membro', 'editor', 'manager@example.test');
        $this->assertNull($result, 'Pairing com email divergente deve ser rejeitado.');
    }

    // --- Invitation: one-time acceptance ---

    public function test_invitation_token_cannot_be_accepted_twice(): void
    {
        $crm = app(CrmService::class);
        $tokenHash = str_repeat('f', 64);
        $now = Clock::nowMs();

        $crm->createInvitation([
            'tokenHash' => $tokenHash,
            'email' => 'invite-reuse@example.test',
            'name' => 'Convidado Reuso',
            'role' => 'editor',
            'invitedBy' => 'manager@example.test',
            'expiresAtMs' => $now + 3_600_000,
        ]);

        // Primeira aceitação — deve funcionar.
        $first = $crm->acceptInvitation($tokenHash, 'invite-reuse-subject', 'invite-reuse@example.test');
        $this->assertNotNull($first, 'Primeira aceitação do convite deve funcionar.');

        // Segunda aceitação — deve retornar null (convite já aceito).
        $second = $crm->acceptInvitation($tokenHash, 'invite-reuse-subject', 'invite-reuse@example.test');
        $this->assertNull($second, 'Reuso de invitation token deve ser rejeitado.');
    }

    public function test_revoked_invitation_cannot_be_accepted(): void
    {
        $crm = app(CrmService::class);
        $tokenHash = str_repeat('g', 64);
        $email = 'revoked-invite@example.test';
        $now = Clock::nowMs();

        $crm->createInvitation([
            'tokenHash' => $tokenHash,
            'email' => $email,
            'name' => 'Convidado Revogado',
            'role' => 'editor',
            'invitedBy' => 'manager@example.test',
            'expiresAtMs' => $now + 3_600_000,
        ]);

        $crm->revokeInvitations($email);

        $result = $crm->acceptInvitation($tokenHash, 'revoked-subject', $email);
        $this->assertNull($result, 'Convite revogado deve ser rejeitado.');
    }
}
