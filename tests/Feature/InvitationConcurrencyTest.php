<?php

namespace Tests\Feature;

use App\Services\CrmService;
use App\Support\Clock;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InvitationConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_replacing_an_invitation_leaves_exactly_one_active_token_for_an_email(): void
    {
        $crm = app(CrmService::class);
        $crm->createInvitation($this->serviceInvitation(str_repeat('a', 64)));
        $crm->createInvitation($this->serviceInvitation(str_repeat('b', 64)));

        $this->assertSame(1, DB::table('morada_staff_invitations')
            ->where('email', 'invitee@example.test')
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->count());
        $this->assertNotNull(DB::table('morada_staff_invitations')
            ->where('token_hash', str_repeat('a', 64))
            ->value('revoked_at'));
    }

    public function test_database_rejects_two_active_invitations_even_if_application_logic_is_bypassed(): void
    {
        DB::table('morada_staff_invitations')->insert($this->invitation(str_repeat('a', 64)));

        $this->expectException(QueryException::class);
        DB::table('morada_staff_invitations')->insert($this->invitation(str_repeat('b', 64)));
    }

    public function test_acceptance_is_one_time_and_a_revoked_or_expired_invitation_is_denied(): void
    {
        $crm = app(CrmService::class);
        $token = str_repeat('c', 64);
        $crm->createInvitation($this->serviceInvitation($token));

        $first = $crm->acceptInvitation($token, 'accepted-subject', 'invitee@example.test');
        $this->assertNotNull($first);
        $this->assertNull($crm->acceptInvitation($token, 'accepted-subject', 'invitee@example.test'));

        $revoked = str_repeat('d', 64);
        DB::table('morada_staff_invitations')->insert($this->invitation($revoked, 'revoked@example.test'));
        $crm->revokeInvitations('revoked@example.test');
        $this->assertNull($crm->acceptInvitation($revoked, 'revoked-subject', 'revoked@example.test'));

        $expired = str_repeat('e', 64);
        DB::table('morada_staff_invitations')->insert($this->invitation($expired, 'expired@example.test', Clock::nowMs() - 1));
        $this->assertNull($crm->acceptInvitation($expired, 'expired-subject', 'expired@example.test'));
    }

    /** @return array<string, mixed> */
    private function invitation(string $tokenHash, string $email = 'invitee@example.test', ?int $expiresAtMs = null): array
    {
        return [
            'token_hash' => $tokenHash,
            'email' => $email,
            'name' => 'Convidado',
            'role' => 'editor',
            'invited_by' => 'manager@example.test',
            'expires_at_ms' => $expiresAtMs ?? Clock::nowMs() + 3_600_000,
            'created_at' => now(),
        ];
    }

    /** @return array<string, mixed> */
    private function serviceInvitation(string $tokenHash): array
    {
        return [
            'tokenHash' => $tokenHash,
            'email' => 'invitee@example.test',
            'name' => 'Convidado',
            'role' => 'editor',
            'invitedBy' => 'manager@example.test',
            'expiresAtMs' => Clock::nowMs() + 3_600_000,
        ];
    }
}
