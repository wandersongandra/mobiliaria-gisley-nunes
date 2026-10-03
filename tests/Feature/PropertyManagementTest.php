<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PropertyManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
    }

    public function test_admin_properties_are_paginated_with_summary_counts(): void
    {
        $session = $this->createAdminSession();
        for ($index = 0; $index < 25; $index++) {
            $this->createProperty('Imóvel '.$index, $index < 3 ? 'published' : 'draft');
        }

        $this->withSession($session)->getJson('/api/admin/properties')
            ->assertOk()
            ->assertJsonCount(20, 'properties')
            ->assertJsonPath('pagination.per_page', 20)
            ->assertJsonPath('pagination.total', 25)
            ->assertJsonPath('pagination.last_page', 2)
            ->assertJsonPath('summary.total', 25)
            ->assertJsonPath('summary.published', 3)
            ->assertJsonPath('summary.draft', 22);

        $this->withSession($session)->getJson('/api/admin/properties?per_page=20&page=3')
            ->assertOk()
            ->assertJsonCount(0, 'properties')
            ->assertJsonPath('pagination.current_page', 3);
    }

    public function test_admin_property_search_and_status_filters_share_server_pagination(): void
    {
        $session = $this->createAdminSession();
        $this->createProperty('Cobertura Lagoa', 'published');
        $this->createProperty('Casa Lagoa', 'draft');
        $this->createProperty('Apartamento Centro', 'published');

        $this->withSession($session)->getJson('/api/admin/properties?search=Lagoa&status=published')
            ->assertOk()
            ->assertJsonCount(1, 'properties')
            ->assertJsonPath('properties.0.title', 'Cobertura Lagoa')
            ->assertJsonPath('pagination.total', 1);

        $this->withSession($session)->getJson('/api/admin/properties?search=sem-correspondencia')
            ->assertOk()
            ->assertJsonCount(0, 'properties')
            ->assertJsonPath('pagination.total', 0);
    }

    public function test_admin_property_filters_reject_invalid_status_and_page_size(): void
    {
        $session = $this->createAdminSession();

        $this->withSession($session)->getJson('/api/admin/properties?status=for-sale')->assertUnprocessable();
        $this->withSession($session)->getJson('/api/admin/properties?per_page=19')->assertUnprocessable();
    }

    private function createProperty(string $title, string $status): void
    {
        $property = app(PropertyService::class)->saveProperty([
            'title' => $title,
            'location' => str_contains($title, 'Lagoa') ? 'Lagoa · Belo Horizonte' : 'Centro · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'status' => 'draft',
        ]);

        if ($status !== 'draft') {
            DB::table('morada_properties')->where('id', $property['id'])->update(['status' => $status]);
        }
    }

    private function createAdminSession(): array
    {
        $openId = 'property-list-'.Str::uuid();
        $email = 'manager-'.Str::uuid().'@example.test';
        $jti = (string) Str::uuid();
        $now = Clock::nowMs();

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => $email,
            'name' => 'Gestora de teste',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        DB::table('morada_staff_access')->insert([
            'email' => $email,
            'open_id' => $openId,
            'name' => 'Gestora de teste',
            'role' => 'manager',
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
}
