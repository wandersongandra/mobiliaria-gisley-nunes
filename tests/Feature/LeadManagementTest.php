<?php

namespace Tests\Feature;

use App\Support\Clock;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class LeadManagementTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
        $this->withServerVariables(['HTTPS' => 'on', 'SERVER_PORT' => '443', 'HTTP_HOST' => 'test.local']);
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

    public function test_search_matches_phone_and_summary_counts_all_pipeline_stages(): void
    {
        $session = $this->createAdminSession('manager');
        $match = $this->createLead([
            'name' => 'Busca pelo WhatsApp',
            'phone' => '31991234567',
            'status' => 'contacted',
        ]);
        $this->createLead(['status' => 'closed']);
        $this->createLead(['status' => 'lost']);

        $this->withSession($session)
            ->getJson('/api/admin/leads?search=31991234567')
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.id', $match)
            ->assertJsonPath('summary.new', 0)
            ->assertJsonPath('summary.em_contato', 1)
            ->assertJsonPath('summary.fechado', 1)
            ->assertJsonPath('summary.perdido', 1)
            ->assertJsonPath('summary.total', 3);

        $this->withSession($session)
            ->getJson('/api/admin/leads?search=%2831%29%2099123-4567')
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.id', $match);
    }

    public function test_active_assignees_follow_up_and_history_are_updated_safely(): void
    {
        $leadId = $this->createLead();
        $editorSession = $this->createAdminSession('editor');
        $managerSession = $this->createAdminSession('manager');
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];

        $this->withSession($editorSession)
            ->getJson('/api/admin/leads/assignees')
            ->assertOk()
            ->assertJsonPath('assignees.0.email', 'editor@example.test');

        $this->withSession($managerSession)
            ->withHeaders($headers)
            ->patchJson('/api/admin/leads/'.$leadId, [
                'assigned_to_email' => 'editor@example.test',
                'follow_up_date' => '2026-11-10',
            ])
            ->assertOk();

        $this->assertDatabaseHas('morada_contact_leads', [
            'id' => $leadId,
            'assigned_to_email' => 'editor@example.test',
            'follow_up_date' => '2026-11-10',
        ]);
        $this->assertDatabaseCount('morada_lead_activities', 2);

        $this->withSession($managerSession)
            ->withHeaders($headers)
            ->patchJson('/api/admin/leads/'.$leadId, ['assigned_to_email' => 'inactive@example.test'])
            ->assertUnprocessable();
    }

    public function test_only_managers_can_export_leads(): void
    {
        $leadId = $this->createLead(['phone' => '31991234567']);
        $editorSession = $this->createAdminSession('editor');
        $managerSession = $this->createAdminSession('manager');
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local', 'X-CSRF-TOKEN' => 'csrf-contract-token'];

        $this->withSession($editorSession)
            ->withHeaders($headers)
            ->postJson('/api/admin/leads/export', ['format' => 'json'])
            ->assertForbidden();

        $this->withSession($managerSession)
            ->withHeaders($headers)
            ->postJson('/api/admin/leads/export', ['format' => 'json'])
            ->assertOk()
            ->assertJsonPath('leads.0.id', $leadId)
            ->assertJsonPath('leads.0.phone', '31991234567')
            ->assertJsonMissingPath('leads.0.internal_notes');
    }

    public function test_lead_reads_are_audited_without_copying_lead_personal_data(): void
    {
        $session = $this->createAdminSession('manager');
        $this->createLead([
            'name' => 'Nome Privado do Lead',
            'email' => 'privado@example.test',
            'message' => 'Mensagem privada de contato.',
        ]);

        $this->withSession($session)
            ->getJson('/api/admin/leads?status=new&page=1')
            ->assertOk()
            ->assertJsonCount(1, 'leads');

        $audit = DB::table('morada_audit_log')->where('action', 'lead.read')->first();
        $this->assertNotNull($audit);
        $this->assertSame('lead', $audit->entity_type);

        $details = json_decode((string) $audit->details, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('new', $details['filters']['status']);
        $this->assertNull($details['filters']['date_from']);
        $this->assertNull($details['filters']['date_to']);
        $this->assertSame(1, $details['total']);
        $this->assertSame(1, $details['returned']);
        $this->assertStringNotContainsString('Nome Privado do Lead', (string) $audit->details);
        $this->assertStringNotContainsString('privado@example.test', (string) $audit->details);
        $this->assertStringNotContainsString('Mensagem privada de contato.', (string) $audit->details);
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
        $this->withSession($session)->getJson('/api/admin/leads?page=1001')->assertUnprocessable();
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
        $filters = [
            'status' => 'perdido',
            'date_from' => '2026-09-01',
            'date_to' => '2026-09-30',
        ];

        $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local', 'X-CSRF-TOKEN' => 'csrf-contract-token'])
            ->postJson('/api/admin/leads/export', $filters + ['format' => 'json'])
            ->assertOk()
            ->assertJsonCount(1, 'leads')
            ->assertJsonPath('leads.0.name', '=1+1');

        $csv = $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local', 'X-CSRF-TOKEN' => 'csrf-contract-token'])
            ->post('/api/admin/leads/export', $filters + ['format' => 'csv'])
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $this->assertStringContainsString("'=1+1", $csv->streamedContent());
        $this->assertStringNotContainsString('Outro contato', $csv->streamedContent());
    }

    public function test_lead_export_rejects_get_to_keep_pii_exports_csrf_protected(): void
    {
        $session = $this->createAdminSession('manager');

        $this->withSession($session)
            ->get('/api/admin/leads/export?format=csv')
            ->assertNotFound();
    }

    private function createAdminSession(string $role): array
    {
        $openId = 'lead-test-'.Str::uuid();
        $email = $role.'@example.test';
        $jti = (string) Str::uuid();
        $now = Clock::nowMs();

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => $email,
            'name' => ucfirst($role).' test user',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        $identity = $this->attachAdminIdentity($openId, $email, ucfirst($role).' test user');
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
            'user_id' => $identity['user_id'],
            'oauth_identity_id' => $identity['identity_id'],
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
