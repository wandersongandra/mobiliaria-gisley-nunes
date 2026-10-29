<?php

namespace Tests\Feature;

use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class OwnerRequestsTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
    }

    public function test_editor_can_edit_only_a_draft_property_created_by_the_same_identity(): void
    {
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];
        $editor = $this->createAdminSession('editor');
        $manager = $this->createAdminSession('manager');

        $owned = $this->withSession($editor)->withHeaders($headers)
            ->postJson('/api/admin/properties', $this->propertyInput('Imóvel do corretor'))
            ->assertCreated()
            ->json('property');
        $other = $this->withSession($manager)->withHeaders($headers)
            ->postJson('/api/admin/properties', $this->propertyInput('Imóvel do gestor'))
            ->assertCreated()
            ->json('property');

        $this->withSession($editor)->withHeaders($headers)
            ->putJson('/api/admin/properties/'.$owned['id'], $this->propertyInput('Imóvel atualizado'))
            ->assertOk();

        $this->withSession($editor)->withHeaders($headers)
            ->putJson('/api/admin/properties/'.$other['id'], $this->propertyInput('Tentativa indevida'))
            ->assertForbidden()
            ->assertJson(['error' => 'CAPABILITY_REQUIRED']);
    }

    public function test_profile_and_lead_attendance_are_persisted_with_access_controls(): void
    {
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];
        $editor = $this->createAdminSession('editor');
        $leadId = (string) Str::uuid();
        DB::table('morada_contact_leads')->insert([
            'id' => $leadId,
            'name' => 'Cliente de teste',
            'email' => 'cliente@example.test',
            'interest' => 'Quero comprar um imóvel',
            'message' => 'Procuro uma casa.',
            'status' => 'new',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->withSession($editor)->withHeaders($headers)
            ->putJson('/api/admin/profile', ['address' => 'Rua de teste, 100', 'birthDate' => '1990-05-20'])
            ->assertOk()
            ->assertJsonPath('profile.birthDate', '1990-05-20');

        $this->withSession($editor)->withHeaders($headers)
            ->postJson('/api/admin/leads/'.$leadId.'/activities', ['type' => 'call', 'body' => 'Ligação realizada.'])
            ->assertCreated()
            ->assertJsonPath('lead.activities.0.body', 'Ligação realizada.');

        $this->withSession($editor)->withHeaders($headers)
            ->patchJson('/api/admin/leads/'.$leadId, ['status' => 'em_contato'])
            ->assertOk();

        $this->assertDatabaseCount('morada_lead_activities', 2);
        $this->assertDatabaseHas('morada_staff_access', [
            'open_id' => $editor['admin_open_id'],
            'address' => 'Rua de teste, 100',
            'birth_date' => '1990-05-20',
        ]);
    }

    public function test_form_templates_are_manager_only_and_json_is_stored_as_data(): void
    {
        $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];
        $editor = $this->createAdminSession('editor');
        $manager = $this->createAdminSession('manager');
        $payload = [
            'slug' => 'ficha-cliente',
            'title' => 'Ficha de cliente',
            'description' => 'Modelo inicial',
            'definition' => ['fields' => [['name' => 'nome', 'type' => 'text']]],
            'active' => true,
        ];

        $this->withSession($editor)->withHeaders($headers)
            ->postJson('/api/admin/forms', $payload)
            ->assertForbidden();

        $this->withSession($manager)->withHeaders($headers)
            ->postJson('/api/admin/forms', $payload)
            ->assertCreated()
            ->assertJsonPath('form.definition.fields.0.name', 'nome');
    }

    private function propertyInput(string $title): array
    {
        return [
            'title' => $title,
            'location' => 'Centro · Belo Horizonte',
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
        ];
    }

    private function createAdminSession(string $role): array
    {
        $openId = $role.'-owner-'.Str::uuid();
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
