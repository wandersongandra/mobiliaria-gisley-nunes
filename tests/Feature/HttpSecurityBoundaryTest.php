<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class HttpSecurityBoundaryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.url' => 'https://www.example.test',
            'app.admin_url' => 'https://admin.example.test',
        ]);
    }

    public function test_production_rejects_unknown_hosts(): void
    {
        $this->app->instance('env', 'production');

        $this->get('https://unknown.example.test/health/live')
            ->assertStatus(421)
            ->assertJson(['error' => 'MISDIRECTED_REQUEST']);
    }

    public function test_public_host_redirects_admin_entry_to_admin_origin(): void
    {
        $this->app->instance('env', 'production');

        $this->get('https://www.example.test/admin')
            ->assertStatus(307)
            ->assertRedirect('https://admin.example.test/admin');
    }

    public function test_public_host_does_not_serve_sensitive_admin_api(): void
    {
        $this->app->instance('env', 'production');

        $this->getJson('https://www.example.test/api/admin/session')
            ->assertNotFound()
            ->assertJson(['error' => 'NOT_FOUND']);
    }

    public function test_release_metadata_requires_an_authenticated_admin_session(): void
    {
        $this->getJson('/api/admin/release')
            ->assertUnauthorized()
            ->assertJson(['error' => 'AUTH_REQUIRED']);
    }

    public function test_security_headers_cover_browser_isolation_and_admin_noindex(): void
    {
        $response = $this->withHeaders(['Host' => 'admin.example.test'])
            ->get('/admin');

        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Cross-Origin-Opener-Policy', 'same-origin');
        $response->assertHeader('Cross-Origin-Resource-Policy', 'same-origin');
        $response->assertHeader('Origin-Agent-Cluster', '?1');
        $response->assertHeader('X-Permitted-Cross-Domain-Policies', 'none');
        $response->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        $response->assertHeader('Referrer-Policy', 'no-referrer');

        $csp = (string) $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("script-src-attr 'none'", $csp);
        $this->assertStringContainsString("frame-src 'none'", $csp);
        $this->assertStringContainsString("worker-src 'none'", $csp);
        $this->assertStringNotContainsString('r2.cloudflarestorage.com', $csp);
    }

    public function test_oauth_callback_never_exposes_its_query_to_referrers(): void
    {
        $response = $this->get('/oauth/google/return?code=synthetic-code&state=synthetic-state');

        $response->assertHeader('Referrer-Policy', 'no-referrer');
        $response->assertHeader('Cache-Control', 'no-store, private');
        $response->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    public function test_unhandled_http_errors_use_the_api_error_contract(): void
    {
        Route::get('/api/test-http-error', static function (): never {
            abort(500);
        });

        $this->getJson('/api/test-http-error')
            ->assertStatus(500)
            ->assertJson(['error' => 'INTERNAL_ERROR']);
    }

    public function test_api_not_found_and_method_not_allowed_are_json(): void
    {
        Route::get('/api/test-http-not-found', static function (): never {
            abort(404);
        });
        Route::get('/api/test-http-method', static function (): never {
            abort(405);
        });

        $this->getJson('/api/test-http-not-found')
            ->assertNotFound()
            ->assertJson(['error' => 'NOT_FOUND']);

        $this->getJson('/api/test-http-method')
            ->assertStatus(405)
            ->assertJson(['error' => 'METHOD_NOT_ALLOWED']);
    }

    public function test_non_api_http_errors_keep_the_html_response_contract(): void
    {
        Route::get('/test-http-not-found', static function (): never {
            abort(404);
        });

        $response = $this->get('/test-http-not-found');

        $response->assertNotFound();
        $this->assertStringContainsString('text/html', (string) $response->headers->get('Content-Type'));
        $this->assertStringNotContainsString('"error"', $response->getContent() ?: '');
    }
}
