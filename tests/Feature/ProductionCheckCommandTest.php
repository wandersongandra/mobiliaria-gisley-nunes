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
            'services.media.root' => storage_path('app/private/media'),
            'services.google_oauth.client_id' => 'client-id.apps.googleusercontent.com',
            'services.google_oauth.client_secret' => 'not-printed-secret',
            'gisley.admin.bootstrap_open_ids' => ['bootstrap-open-id'],
            'gisley.admin.bootstrap_emails' => [],
            'gisley.network.trusted_proxies' => ['203.0.113.0/24'],
        ]);

        $command = $this->artisan('app:production-check')
            ->expectsOutputToContain('[OK] APP_ENV is production')
            ->expectsOutputToContain('[OK] APP_DEBUG is disabled')
            ->expectsOutputToContain('[OK] APP_KEY has a supported cipher length')
            ->expectsOutputToContain('[OK] APP_URL and ADMIN_ORIGIN use distinct HTTPS hosts')
            ->expectsOutputToContain('[OK] MySQL connection settings are present')
            ->expectsOutputToContain('[OK] required PHP extensions are available')
            ->expectsOutputToContain('[OK] session.upload_progress is disabled')
            ->expectsOutputToContain('[OK] post_max_size is bounded')
            ->expectsOutputToContain('[OK] local media and bootstrap cache directories are writable')
            ->expectsOutputToContain('[OK] session cookies are host-bound, secure and HttpOnly')
            ->expectsOutputToContain('[OK] session and cache drivers do not require a persistent worker')
            ->expectsOutputToContain('[OK] queue driver does not require a persistent worker')
            ->expectsOutputToContain('[OK] OAuth configuration uses secure endpoints and callback path')
            ->expectsOutputToContain('[OK] bootstrap identity is configured and valid')
            ->expectsOutputToContain('[OK] trusted proxy CIDRs are configured')
            ->doesntExpectOutputToContain('not-printed-secret');

        if ($this->isPatchedPhpVersion()) {
            $command->expectsOutputToContain('Production configuration checks passed.')
                ->assertSuccessful();
        } else {
            $command->expectsOutputToContain('[FAIL] PHP version is patched')
                ->assertFailed();
        }
    }

    private function isPatchedPhpVersion(): bool
    {
        $patches = [
            '8.2' => '8.2.35',
            '8.3' => '8.3.36',
            '8.4' => '8.4.27',
            '8.5' => '8.5.12',
        ];

        foreach ($patches as $branch => $minimum) {
            if (version_compare(PHP_VERSION, $branch.'.0', '>=')
                && version_compare(PHP_VERSION, $branch.'.999', '<')) {
                return version_compare(PHP_VERSION, $minimum, '>=');
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

    public function test_production_check_rejects_media_root_inside_the_document_root(): void
    {
        config([
            'app.env' => 'production',
            'services.media.root' => public_path('media'),
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] local media and bootstrap cache directories are writable')
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
