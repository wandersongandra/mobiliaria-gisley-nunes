<?php

namespace Tests\Feature;

use App\Services\CrmService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EphemeralAuthRecordTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_auth_challenge_prunes_expired_challenges(): void
    {
        $now = Clock::nowMs();

        DB::table('morada_auth_challenges')->insert([
            'state_hash' => hash('sha256', 'expired-state'),
            'redirect_uri' => 'https://admin.example.test/oauth/google/return',
            'invitation_hash' => null,
            'expires_at_ms' => $now - 1,
            'created_at' => now(),
        ]);

        app(CrmService::class)->createAuthChallenge(
            hash('sha256', 'fresh-state'),
            'https://admin.example.test/oauth/google/return',
            $now + 600_000,
            null,
        );

        $this->assertDatabaseMissing('morada_auth_challenges', [
            'state_hash' => hash('sha256', 'expired-state'),
        ]);
        $this->assertDatabaseHas('morada_auth_challenges', [
            'state_hash' => hash('sha256', 'fresh-state'),
        ]);
    }

    public function test_creating_pairing_prunes_expired_pairings(): void
    {
        $now = Clock::nowMs();

        DB::table('morada_identity_pairings')->insert([
            'code_hash' => hash('sha256', 'expired-code'),
            'open_id' => 'expired-subject',
            'email' => 'expired@example.test',
            'expires_at_ms' => $now - 1,
            'created_at' => now(),
        ]);

        app(CrmService::class)->createPairing(
            hash('sha256', 'fresh-code'),
            'fresh-subject',
            'fresh@example.test',
            $now + 900_000,
        );

        $this->assertDatabaseMissing('morada_identity_pairings', [
            'code_hash' => hash('sha256', 'expired-code'),
        ]);
        $this->assertDatabaseHas('morada_identity_pairings', [
            'code_hash' => hash('sha256', 'fresh-code'),
        ]);
    }
}
