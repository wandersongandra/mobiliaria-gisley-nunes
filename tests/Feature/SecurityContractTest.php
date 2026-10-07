<?php

namespace Tests\Feature;

use App\Services\AdminAccessService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class SecurityContractTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
    }

    public function test_editor_can_save_drafts_but_cannot_publish_or_delete_leads(): void
    {
        $editor = $this->createAdminSession('editor');
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];
        $draft = $this->withSession($editor)->withHeaders($headers)
            ->postJson('/api/admin/properties', $this->propertyInput('Rascunho da equipe'))
            ->assertCreated()
            ->json('property');

        $this->withSession($editor)->withHeaders($headers)
            ->putJson('/api/admin/properties/'.$draft['id'], $this->propertyInput('Rascunho da equipe', ['status' => 'published']))
            ->assertForbidden()
            ->assertJson(['error' => 'CAPABILITY_REQUIRED']);

        $leadId = $this->createLead();
        $this->withSession($editor)->withHeaders($headers)
            ->deleteJson('/api/admin/leads/'.$leadId)
            ->assertForbidden()
            ->assertJson(['error' => 'CAPABILITY_REQUIRED']);

        $manager = $this->createAdminSession('manager');
        $this->withSession($manager)->withHeaders($headers)
            ->deleteJson('/api/admin/leads/'.$leadId)
            ->assertNoContent();
        $this->assertDatabaseMissing('morada_contact_leads', ['id' => $leadId]);
    }

    public function test_sensitive_write_requires_csrf_and_a_valid_https_origin(): void
    {
        $this->app->instance('env', 'production');
        $this->assertFalse($this->app->runningUnitTests());
        $session = $this->createAdminSession('manager') + ['_token' => 'csrf-contract-token'];
        $leadId = $this->createLead();
        $path = '/api/admin/leads/'.$leadId;

        $this->withSession($session)
            ->withServerVariables([
                'HTTP_HOST' => 'test.local',
                'SERVER_NAME' => 'test.local',
                'HTTPS' => 'on',
                'SERVER_PORT' => 443,
            ])
            ->withHeaders(['X-CSRF-TOKEN' => 'csrf-contract-token'])
            ->patchJson($path, ['status' => 'em_contato'])
            ->assertForbidden()
            ->assertJson(['error' => 'ORIGIN_REQUIRED']);

        $this->withSession($session)
            ->withServerVariables([
                'HTTP_HOST' => 'test.local',
                'SERVER_NAME' => 'test.local',
                'HTTPS' => 'on',
                'SERVER_PORT' => 443,
            ])
            ->withHeaders(['Origin' => 'https://attacker.example', 'X-CSRF-TOKEN' => 'csrf-contract-token'])
            ->patchJson($path, ['status' => 'em_contato'])
            ->assertForbidden()
            ->assertJson(['error' => 'INVALID_ORIGIN']);

        $csrfResponse = $this->withSession($session)
            ->withServerVariables([
                'HTTP_HOST' => 'test.local',
                'SERVER_NAME' => 'test.local',
                'HTTPS' => 'on',
                'SERVER_PORT' => 443,
            ])
            ->withHeaders(['Origin' => 'https://test.local', 'X-CSRF-TOKEN' => ''])
            ->patchJson($path, ['status' => 'em_contato']);
        $this->assertSame(419, $csrfResponse->status(), $csrfResponse->content());
        $csrfResponse->assertJson(['error' => 'CSRF_TOKEN_MISMATCH']);

        $this->withSession($session)
            ->withServerVariables([
                'HTTP_HOST' => 'test.local',
                'SERVER_NAME' => 'test.local',
                'HTTPS' => 'on',
                'SERVER_PORT' => 443,
            ])
            ->withHeaders(['Origin' => 'https://test.local', 'X-CSRF-TOKEN' => 'csrf-contract-token'])
            ->patchJson($path, ['status' => 'em_contato'])
            ->assertOk();
    }

    public function test_sensitive_write_rejects_the_same_host_on_an_unconfigured_port(): void
    {
        $this->app->instance('env', 'production');
        $session = $this->createAdminSession('manager') + ['_token' => 'csrf-contract-token'];
        $leadId = $this->createLead();

        $this->withSession($session)
            ->withServerVariables([
                'HTTP_HOST' => 'test.local',
                'SERVER_NAME' => 'test.local',
                'HTTPS' => 'on',
                'SERVER_PORT' => 443,
            ])
            ->withHeaders([
                'Origin' => 'https://test.local:8443',
                'X-CSRF-TOKEN' => 'csrf-contract-token',
            ])
            ->patchJson('/api/admin/leads/'.$leadId, ['status' => 'em_contato'])
            ->assertForbidden()
            ->assertJson(['error' => 'INVALID_ORIGIN']);
    }

    public function test_logout_and_logout_all_write_an_audit_event_without_exposing_session_ids(): void
    {
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];
        $session = $this->createAdminSession('manager');

        $this->withSession($session)->withHeaders($headers)
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->assertDatabaseHas('morada_audit_log', [
            'action' => 'auth.logout',
            'entity_type' => 'admin_user',
        ]);

        $session = $this->createAdminSession('manager');
        $this->withSession($session)->withHeaders($headers)
            ->postJson('/api/auth/logout-all')
            ->assertOk()
            ->assertJson(['ok' => true]);

        $audit = DB::table('morada_audit_log')->where('action', 'auth.logout_all')->first();
        $this->assertNotNull($audit);
        $this->assertStringNotContainsString('admin_jti', (string) $audit->details);
    }

    public function test_critical_boundary_revalidates_a_session_after_logout_all(): void
    {
        $session = $this->createAdminSession('manager');
        $record = DB::table('morada_admin_sessions')->where('jti', $session['admin_jti'])->first();
        $this->assertNotNull($record);

        $request = Request::create('/api/admin/team', 'POST');
        $request->setLaravelSession($this->app['session']->driver());
        $request->session()->put('admin_jti', $session['admin_jti']);
        $access = app(AdminAccessService::class);
        $this->assertNotNull($access->current($request));

        $access->revokeAll((string) $record->user_id);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('AUTH_REQUIRED');
        $access->requireCurrent($request);
    }

    private function propertyInput(string $title, array $overrides = []): array
    {
        return array_merge([
            'title' => $title,
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'price' => 850000,
            'priceLabel' => 'R$ 850.000',
            'bedrooms' => 2,
            'bathrooms' => 2,
            'areaM2' => 82.5,
            'suites' => 1,
            'parkingSpots' => 2,
            'condoFee' => 900,
            'iptu' => 2500,
            'description' => 'Imóvel de teste.',
            'status' => 'draft',
            'featured' => false,
        ], $overrides);
    }

    private function createLead(): string
    {
        $id = (string) Str::uuid();
        DB::table('morada_contact_leads')->insert([
            'id' => $id,
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.test',
            'interest' => 'Quero comprar um imóvel',
            'message' => 'Procuro um imóvel.',
            'status' => 'new',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function createAdminSession(string $role): array
    {
        $openId = $role.'-security-'.Str::uuid();
        $email = $role.'-'.Str::uuid().'@example.test';
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
}
