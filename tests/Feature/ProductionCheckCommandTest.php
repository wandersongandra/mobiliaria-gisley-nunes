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
            'app.admin_url' => 'https://admin.example.test',
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
            'gisley.admin.bootstrap_open_ids' => ['bootstrap-open-id'],
            'gisley.admin.bootstrap_emails' => [],
            'gisley.network.trusted_proxies' => ['203.0.113.0/24'],
        ]);

        $command = $this->artisan('app:production-check')
            ->expectsOutputToContain('[OK] APP_ENV is production')
            ->doesntExpectOutputToContain('not-printed-secret');

        // PHP2Shell (CVE-2026-109618/109619): em PHP patched (>= 8.2.35), todos
        // os checks passam. Em PHP não patched, o check de versão falha
        // corretamente — ambos são comportamento esperado.
        $patched = $this->isPatchedPhpVersion();
        if ($patched) {
            $command->expectsOutputToContain('Production configuration checks passed.')
                ->assertSuccessful();
        } else {
            $command->expectsOutputToContain('[FAIL] PHP version is patched against PHP2Shell')
                ->assertFailed();
        }
    }

    /**
     * Mesma lógica do ProductionCheck::isPatchedPhpVersion() — duplicated here
     * so the test doesn't depend on a private method via reflection.
     */
    private function isPatchedPhpVersion(): bool
    {
        $patches = [
            '8.2' => '8.2.35',
            '8.3' => '8.3.36',
            '8.4' => '8.4.27',
            '8.5' => '8.5.12',
        ];

        foreach ($patches as $branch => $minPatched) {
            if (version_compare(PHP_VERSION, $branch.'.0', '>=') && version_compare(PHP_VERSION, $branch.'.999', '<')) {
                return version_compare(PHP_VERSION, $minPatched, '>=');
            }
        }

        return false;
    }

    public function test_production_check_rejects_an_invalid_bootstrap_identity(): void
    {
        config([
            'app.env' => 'production',
            'gisley.admin.bootstrap_open_ids' => [],
            'gisley.admin.bootstrap_emails' => ['not-an-email'],
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] bootstrap identity is configured and valid')
            ->assertFailed();
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

    public function test_production_check_rejects_a_domain_scoped_admin_cookie(): void
    {
        config([
            'app.env' => 'production',
            'session.cookie' => '__Host-gisley_session',
            'session.secure' => true,
            'session.http_only' => true,
            'session.path' => '/',
            'session.domain' => '.example.test',
            'session.same_site' => 'lax',
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] session cookies are host-bound, secure and HttpOnly')
            ->assertFailed();
    }

    public function test_production_check_rejects_public_and_admin_on_the_same_host(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'app.url' => 'https://example.test',
            'app.admin_url' => 'https://example.test:8443',
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] APP_URL and ADMIN_ORIGIN use distinct HTTPS hosts')
            ->assertFailed();
    }

    public function test_production_check_rejects_origins_with_a_path_or_query_string(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'app.url' => 'https://www.example.test/public?tenant=1',
            'app.admin_url' => 'https://admin.example.test/',
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] APP_URL and ADMIN_ORIGIN use distinct HTTPS hosts')
            ->assertFailed();
    }

    public function test_production_check_rejects_a_world_trusted_proxy_range(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'gisley.network.trusted_proxies' => ['0.0.0.0/0'],
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] trusted proxy CIDRs are configured')
            ->assertFailed();
    }

    public function test_production_check_rejects_insecure_oauth_endpoint(): void
    {
        config([
            'app.env' => 'production',
            'services.google_oauth.authorization_url' => 'http://accounts.example.test/auth',
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] OAuth configuration uses secure endpoints and callback path')
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
