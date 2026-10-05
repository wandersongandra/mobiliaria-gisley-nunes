<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProductionCheckCommandTest extends TestCase
{
    public function test_production_check_accepts_a_complete_hostgator_configuration_without_printing_secrets(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
            'app.url' => 'https://www.example.test',
            'app.admin_url' => 'https://www.example.test',
            'database.default' => 'mysql',
            'database.connections.mysql.host' => 'localhost',
            'database.connections.mysql.database' => 'gisley',
            'database.connections.mysql.username' => 'gisley_user',
            'database.connections.mysql.password' => 'not-printed-secret',
            'session.driver' => 'file',
            'session.secure' => true,
            'session.http_only' => true,
            'session.same_site' => 'lax',
            'cache.default' => 'file',
            'services.r2.account_id' => 'account',
            'services.r2.bucket' => 'bucket',
            'services.r2.access_key_id' => 'key',
            'services.r2.secret_access_key' => 'not-printed-secret',
            'services.google_oauth.client_id' => 'client-id.apps.googleusercontent.com',
            'services.google_oauth.client_secret' => 'not-printed-secret',
            'gisley.network.trusted_proxies' => ['203.0.113.0/24'],
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[OK] APP_ENV is production')
            ->expectsOutputToContain('Production configuration checks passed.')
            ->doesntExpectOutputToContain('not-printed-secret')
            ->assertSuccessful();
    }

    public function test_production_check_fails_closed_for_an_insecure_configuration(): void
    {
        config([
            'app.env' => 'local',
            'app.debug' => true,
            'app.url' => 'http://example.test',
            'app.admin_url' => 'http://example.test',
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] APP_ENV is production')
            ->expectsOutputToContain('[FAIL] APP_DEBUG is disabled')
            ->assertFailed();
    }

    public function test_production_check_rejects_an_invalid_trusted_proxy_value(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'gisley.network.trusted_proxies' => ['*'],
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] trusted proxy CIDRs are configured')
            ->assertFailed();
    }
}
