<?php

namespace Tests\Feature;

use App\Http\Controllers\PublicApiController;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RequestBoundaryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.url' => 'http://localhost',
            'app.admin_url' => 'http://localhost',
        ]);
    }

    public function test_contact_rejects_payload_larger_than_64_kib(): void
    {
        $payload = [
            'name' => 'Contato',
            'email' => 'contato@example.test',
            'interest' => 'Tenho outra dúvida',
            'message' => str_repeat('A', 70 * 1024),
        ];

        $this->withHeaders([
            'Host' => 'localhost',
            'Origin' => 'http://localhost',
        ])->postJson('/api/contact', $payload)
            ->assertStatus(413)
            ->assertJson([
                'error' => 'PAYLOAD_TOO_LARGE',
                'max_kb' => 64,
            ]);
    }

    public function test_public_catalog_has_a_dedicated_rate_limit(): void
    {
        $route = Route::getRoutes()->getByAction(PublicApiController::class.'@propertiesV2');

        $this->assertNotNull($route);
        $this->assertContains('throttle:public-api', $route->middleware());
    }
}
