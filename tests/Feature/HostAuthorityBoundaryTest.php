<?php

namespace Tests\Feature;

use App\Http\Middleware\RequireAdminOrigin;
use App\Http\Middleware\RequireKnownHost;
use Illuminate\Http\Request;
use Tests\TestCase;

class HostAuthorityBoundaryTest extends TestCase
{
    public function test_admin_origin_rejects_same_host_on_an_unconfigured_port(): void
    {
        config([
            'app.admin_url' => 'https://admin.example.test',
        ]);
        $this->app->instance('env', 'production');

        $request = Request::create('https://admin.example.test:8443/admin/other', 'GET');
        $response = app(RequireAdminOrigin::class)->handle(
            $request,
            static fn () => response('ok'),
        );

        $this->assertSame(404, $response->getStatusCode());
    }

    public function test_known_host_rejects_same_host_on_an_unconfigured_port(): void
    {
        config([
            'app.url' => 'https://www.example.test',
            'app.admin_url' => 'https://admin.example.test',
        ]);
        $this->app->instance('env', 'production');

        $request = Request::create('https://www.example.test:8443/health/live', 'GET');
        $response = app(RequireKnownHost::class)->handle(
            $request,
            static fn () => response('ok'),
        );

        $this->assertSame(421, $response->getStatusCode());
    }

    public function test_default_https_port_remains_equivalent_to_no_explicit_port(): void
    {
        config([
            'app.admin_url' => 'https://admin.example.test',
        ]);
        $this->app->instance('env', 'production');

        $request = Request::create('https://admin.example.test:443/admin', 'GET');
        $response = app(RequireAdminOrigin::class)->handle(
            $request,
            static fn () => response('ok'),
        );

        $this->assertSame(200, $response->getStatusCode());
    }
}
