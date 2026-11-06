<?php

namespace Tests\Feature;

use App\Http\Middleware\RequireSameOrigin;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class OriginIsolationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.url' => 'https://www.example.test',
            'app.admin_url' => 'https://painel.example.test',
        ]);
    }

    public function test_a_public_origin_cannot_authorize_an_admin_mutation(): void
    {
        $response = $this->checkOrigin('https://painel.example.test/api/admin/profile', 'https://www.example.test');

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('INVALID_ORIGIN', json_decode((string) $response->getContent(), true)['error']);
    }

    public function test_an_admin_origin_cannot_authorize_a_public_mutation(): void
    {
        $response = $this->checkOrigin('https://www.example.test/api/contact', 'https://painel.example.test');

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('INVALID_ORIGIN', json_decode((string) $response->getContent(), true)['error']);
    }

    public function test_an_unconfigured_target_cannot_use_a_configured_origin(): void
    {
        $response = $this->checkOrigin('https://outro.example.test/api/contact', 'https://www.example.test');

        $this->assertSame(403, $response->getStatusCode());
    }

    public function test_mutations_from_the_exact_origin_still_work(): void
    {
        foreach (['https://www.example.test', 'https://painel.example.test'] as $origin) {
            $response = $this->checkOrigin($origin.'/api/contact', $origin);
            $this->assertSame(200, $response->getStatusCode());
        }
    }

    public function test_the_same_hostname_over_http_cannot_authorize_an_https_mutation(): void
    {
        $response = $this->checkOrigin('https://painel.example.test/api/admin/profile', 'http://painel.example.test');

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('INVALID_ORIGIN', json_decode((string) $response->getContent(), true)['error']);
    }

    public function test_same_origin_referer_is_accepted_when_origin_is_absent(): void
    {
        $request = Request::create('https://painel.example.test/api/admin/profile', 'PUT');
        $request->headers->set('Referer', 'https://painel.example.test/admin/');

        $response = app(RequireSameOrigin::class)->handle($request, static fn () => response('ok'));

        $this->assertSame(200, $response->getStatusCode());
    }

    private function checkOrigin(string $url, string $origin): Response
    {
        $request = Request::create($url, 'PUT');
        $request->headers->set('Origin', $origin);

        return app(RequireSameOrigin::class)->handle($request, static fn () => response('ok'));
    }
}
