<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class LeadManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
    }

    public function test_leads_are_paginated_and_legacy_statuses_are_normalized(): void
    {
        $session = $this->createAdminSession('manager');
        for ($index = 0; $index < 25; $index++) {
            $this->createLead([
                'status' => $index === 0 ? 'contacted' : 'new',
                'created_at' => Carbon::parse('2026-01-01 00:00:00')->addSeconds($index)->toDateTimeString(),
            ]);
        }

        $this->withSession($session)
            ->getJson('/api/admin/leads')
            ->assertOk()
            ->assertJsonCount(20, 'leads')
            ->assertJsonPath('leads.19.status', 'new')
            ->assertJsonPath('pagination.per_page', 20)
            ->assertJsonPath('pagination.total', 25)
            ->assertJsonPath('pagination.last_page', 2)
            ->assertJsonPath('summary.new', 24);

        $this->withSession($session)
            ->getJson('/api/admin/leads?status=em_contato')
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.status', 'em_contato');

        $this->withSession($session)
            ->getJson('/api/admin/leads?per_page=20&page=3')
            ->assertOk()
            ->assertJsonCount(0, 'leads')
            ->assertJsonPath('pagination.current_page', 3);
    }

    public function test_status_and_date_filters_return_only_matching_leads(): void
    {
        $session = $this->createAdminSession('manager');
        $match = $this->createLead([
            'status' => 'perdido',
            'created_at' => '2026-09-15 10:00:00',
        ]);
        $this->createLead([
            'status' => 'closed',
            'created_at' => '2026-09-16 10:00:00',
        ]);
        $this->createLead([
            'status' => 'new',
            'created_at' => '2026-08-01 10:00:00',
        ]);

        $this->withSession($session)
            ->getJson('/api/admin/leads?status=perdido&date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.id', $match)
            ->assertJsonPath('leads.0.status', 'perdido');
    }

    public function test_invalid_filters_and_page_sizes_are_rejected(): void
    {
        $session = $this->createAdminSession('manager');

        $this->withSession($session)
            ->getJson('/api/admin/leads?status=unknown')
            ->assertUnprocessable();
        $this->withSession($session)
            ->getJson('/api/admin/leads?per_page=19')
            ->assertUnprocessable();
        $this->withSession($session)
            ->getJson('/api/admin/leads?date_from=2026-10-01&date_to=2026-09-01')
            ->assertUnprocessable();
    }

    public function test_lead_status_accepts_only_supported_values_and_requires_authentication(): void
    {
        $leadId = $this->createLead();

        $this->withSession([])
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->getJson('/api/admin/leads')
            ->assertUnauthorized();

        $session = $this->createAdminSession('editor');

        $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->patchJson('/api/admin/leads/'.$leadId, ['status' => 'perdido'])
            ->assertOk();
        $this->assertSame('perdido', DB::table('morada_contact_leads')->where('id', $leadId)->value('status'));

        $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->patchJson('/api/admin/leads/'.$leadId, ['status' => 'qualified'])
            ->assertUnprocessable();

    }

    public function test_exports_use_the_same_filters_and_csv_neutralizes_formulas(): void
    {
        $session = $this->createAdminSession('manager');
        $this->createLead([
            'status' => 'perdido',
            'name' => '=1+1',
            'created_at' => '2026-09-15 10:00:00',
        ]);
        $this->createLead([
            'status' => 'new',
            'name' => 'Outro contato',
            'created_at' => '2026-09-15 10:00:00',
        ]);
        $filters = 'status=perdido&date_from=2026-09-01&date_to=2026-09-30';

        $this->withSession($session)
            ->getJson('/api/admin/leads/export?format=json&'.$filters)
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.name', '=1+1');

        $csv = $this->withSession($session)
            ->get('/api/admin/leads/export?format=csv&'.$filters)
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $this->assertStringContainsString("'=1+1", $csv->getContent());
        $this->assertStringNotContainsString('Outro contato', $csv->getContent());
    }

    private function createAdminSession(string $role): array
    {
        $openId = 'lead-test-'.Str::uuid();
        $email = $role.'@example.test';
        $jti = (string) Str::uuid();
        $now = (int) floor(microtime(true) * 1000);

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => $email,
            'name' => ucfirst($role).' test user',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        DB::table('morada_staff_access')->insert([
            'email' => $email,
            'open_id' => $openId,
            'name' => ucfirst($role).' test user',
            'role' => $role,
            'active' => true,
            'invited_by' => 'test@example.test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'open_id' => $openId,
            'email' => $email,
            'expires_at_ms' => $now + 3_600_000,
            'last_seen_at_ms' => $now,
            'created_at' => now(),
        ]);

        return ['admin_jti' => $jti, 'admin_open_id' => $openId];
    }

    private function createLead(array $overrides = []): string
    {
        $id = (string) Str::uuid();
        $timestamp = $overrides['created_at'] ?? now()->toDateTimeString();

        DB::table('morada_contact_leads')->insert(array_merge([
            'id' => $id,
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.test',
            'interest' => 'Quero comprar um imóvel',
            'message' => 'Procuro um apartamento.',
            'property_path' => null,
            'status' => 'new',
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ], $overrides));

        return $id;
    }
}
