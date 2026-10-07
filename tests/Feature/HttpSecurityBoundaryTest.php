<?php

namespace Tests\Feature;

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

        $this->withHeaders(['Host' => 'unknown.example.test'])
            ->get('/health/live')
            ->assertStatus(421)
            ->assertJson(['error' => 'MISDIRECTED_REQUEST']);
    }

    public function test_public_host_redirects_admin_entry_to_admin_origin(): void
    {
        $this->withHeaders(['Host' => 'www.example.test'])
            ->get('/admin')
            ->assertStatus(307)
            ->assertRedirect('https://admin.example.test/admin');
    }

    public function test_public_host_does_not_serve_sensitive_admin_api(): void
    {
        $this->withHeaders(['Host' => 'www.example.test'])
            ->getJson('/api/admin/session')
            ->assertNotFound()
            ->assertJson(['error' => 'NOT_FOUND']);
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

        $csp = (string) $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("script-src-attr 'none'", $csp);
        $this->assertStringContainsString("frame-src 'none'", $csp);
        $this->assertStringContainsString("worker-src 'none'", $csp);
    }
}
