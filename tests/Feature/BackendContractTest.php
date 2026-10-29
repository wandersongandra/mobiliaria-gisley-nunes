<?php

namespace Tests\Feature;

use App\Services\AdminAccessService;
use App\Services\PropertyService;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class BackendContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_laravel_runtime_liveness_and_readiness_routes_return_success(): void
    {
        $this->getJson('/_app/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok'])
            ->assertHeaderContains('Cache-Control', 'no-store');

        $this->getJson('/health/live')
            ->assertOk()
            ->assertExactJson(['status' => 'ok']);

        $this->getJson('/health/ready')
            ->assertOk()
            ->assertExactJson(['status' => 'ok'])
            ->assertHeaderContains('Cache-Control', 'no-store');
    }

    public function test_health_routes_are_stateless_and_do_not_start_sessions_or_csrf(): void
    {
        foreach (['/_app/health', '/health/live', '/health/ready'] as $uri) {
            $route = Route::getRoutes()->match(Request::create($uri, 'GET'));
            $middleware = $route->gatherMiddleware();

            $this->assertNotContains(StartSession::class, $middleware, $uri);
            $this->assertNotContains(ValidateCsrfToken::class, $middleware, $uri);
        }
    }

    public function test_every_response_exposes_a_safe_request_identifier(): void
    {
        $response = $this->withHeader('X-Request-ID', 'trace_0123456789abcdef')
            ->getJson('/health/live')
            ->assertOk();

        $response->assertHeader('X-Request-ID', 'trace_0123456789abcdef');

        $this->withHeader('X-Request-ID', 'short')
            ->getJson('/health/live')
            ->assertOk()
            ->assertHeader('X-Request-ID');
    }

    public function test_public_json_contracts_boot(): void
    {
        $this->getJson('/api/site')
            ->assertOk()
            ->assertJsonStructure([
                'site' => ['name', 'area', 'email', 'whatsapp'],
                'testimonials',
            ]);

        $this->getJson('/api/properties')
            ->assertOk()
            ->assertHeader('Deprecation', 'true')
            ->assertHeaderContains('Link', '/api/v2/properties')
            ->assertJsonStructure(['properties']);
    }

    public function test_contact_form_is_persisted_with_same_origin(): void
    {
        config(['app.url' => 'http://localhost', 'app.admin_url' => 'http://localhost']);
        $this->withHeader('Origin', 'http://localhost')
            ->postJson('/api/contact', [
                'name' => 'Cliente Teste',
                'email' => 'cliente@example.com',
                'interest' => 'Quero comprar um imóvel',
                'message' => 'Procuro um apartamento em Belo Horizonte.',
                'propertyPath' => '/imoveis',
                'website' => '',
            ])
            ->assertCreated()
            ->assertJson(['ok' => true]);

        $this->assertDatabaseHas('morada_contact_leads', [
            'email' => 'cliente@example.com',
            'status' => 'new',
        ]);
    }

    public function test_contact_rejects_non_scalar_fields_without_http_500_or_persistence(): void
    {
        config(['app.url' => 'http://localhost', 'app.admin_url' => 'http://localhost']);
        $payload = [
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.com',
            'interest' => 'Quero comprar um imóvel',
            'message' => 'Procuro apartamento.',
            'website' => '',
        ];

        foreach (['name', 'email', 'interest', 'message'] as $field) {
            $this->withHeader('Origin', 'http://localhost')
                ->postJson('/api/contact', array_replace($payload, [$field => ['unexpected' => 'array']]))
                ->assertStatus(400)
                ->assertJson(['error' => 'INVALID_CONTACT']);
        }

        $this->assertDatabaseCount('morada_contact_leads', 0);
    }

    public function test_contact_honeypot_array_is_silently_discarded_without_persistence(): void
    {
        config(['app.url' => 'http://localhost', 'app.admin_url' => 'http://localhost']);
        $this->withHeader('Origin', 'http://localhost')
            ->postJson('/api/contact', ['website' => ['bot' => 'value']])
            ->assertCreated()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('morada_contact_leads', 0);
    }

    public function test_admin_session_and_protected_api_contract(): void
    {
        $this->getJson('/api/admin/session')
            ->assertOk()
            ->assertJsonPath('authenticated', false)
            ->assertJsonStructure(['authenticated', 'user', 'csrfToken']);

        $this->getJson('/api/admin/properties')
            ->assertUnauthorized()
            ->assertJson(['error' => 'AUTH_REQUIRED']);
    }

    public function test_property_integer_fields_accept_valid_numbers(): void
    {
        $service = app(PropertyService::class);
        $data = $service->normalizeInput([
            'title' => 'Apartamento Teste',
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
        ]);

        $this->assertSame(2, $data['bedrooms']);
        $this->assertSame(2, $data['bathrooms']);
        $this->assertSame(1, $data['suites']);
        $this->assertSame(2, $data['parking_spots']);
        $this->assertSame(82.5, $data['area_m2']);
    }

    public function test_role_capability_matrix_is_preserved(): void
    {
        $access = app(AdminAccessService::class);

        $editor = ['role' => 'editor'];
        $manager = ['role' => 'manager'];

        $this->assertTrue($access->hasCapability($editor, 'property.write'));
        $this->assertFalse($access->hasCapability($editor, 'property.publish'));
        $this->assertFalse($access->hasCapability($editor, 'team.manage'));

        $this->assertTrue($access->hasCapability($manager, 'property.publish'));
        $this->assertTrue($access->hasCapability($manager, 'lead.erase'));
        $this->assertTrue($access->hasCapability($manager, 'team.manage'));
    }
}
