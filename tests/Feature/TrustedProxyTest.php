<?php

namespace Tests\Feature;

use App\Http\Middleware\ConfigureTrustedProxies;
use Illuminate\Http\Request;
use Tests\TestCase;

class TrustedProxyTest extends TestCase
{
    public function test_direct_client_cannot_spoof_cloudflare_or_forwarded_ip_headers(): void
    {
        config(['gisley.network.trusted_proxies' => ['203.0.113.0/24']]);
        $request = Request::create('/', 'GET', server: [
            'REMOTE_ADDR' => '198.51.100.7',
            'HTTP_X_FORWARDED_FOR' => '192.0.2.10',
            'HTTP_CF_CONNECTING_IP' => '192.0.2.11',
            'HTTP_X_FORWARDED_PROTO' => 'https',
        ]);

        $this->assertSame('198.51.100.7', $this->trustedIp($request));
        $this->assertFalse($request->isSecure());
    }

    public function test_forwarded_client_ip_is_used_only_from_a_configured_proxy(): void
    {
        config(['gisley.network.trusted_proxies' => ['203.0.113.0/24']]);
        $request = Request::create('/', 'GET', server: [
            'REMOTE_ADDR' => '203.0.113.8',
            'HTTP_X_FORWARDED_FOR' => '198.51.100.20, 203.0.113.8',
            'HTTP_CF_CONNECTING_IP' => '192.0.2.11',
            'HTTP_X_FORWARDED_PROTO' => 'https',
        ]);

        $this->assertSame('198.51.100.20', $this->trustedIp($request));
        $this->assertTrue($request->isSecure());
    }

    private function trustedIp(Request $request): string
    {
        $ip = '';
        app(ConfigureTrustedProxies::class)->handle(
            $request,
            static function (Request $configured) use (&$ip) {
                $ip = $configured->ip();

                return response('ok');
            },
        );

        return $ip;
    }
}
