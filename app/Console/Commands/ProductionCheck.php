<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Encryption\Encrypter;

class ProductionCheck extends Command
{
    protected $signature = 'app:production-check';

    protected $description = 'Validate required HostGator production configuration without printing secrets';

    public function handle(): int
    {
        $checks = [
            'APP_ENV is production' => config('app.env') === 'production',
            'APP_DEBUG is disabled' => config('app.debug') === false,
            'PHP version is supported' => version_compare(PHP_VERSION, '8.2.0', '>='),
            'APP_KEY has a supported cipher length' => $this->hasValidAppKey(),
            'APP_URL and ADMIN_ORIGIN use HTTPS' => $this->usesHttps((string) config('app.url'))
                && $this->usesHttps((string) config('app.admin_url')),
            'MySQL connection settings are present' => config('database.default') === 'mysql'
                && $this->configured(['database.connections.mysql.host', 'database.connections.mysql.database', 'database.connections.mysql.username', 'database.connections.mysql.password']),
            'required PHP extensions are available' => $this->requiredExtensionsAvailable(),
            'storage and bootstrap cache directories are writable' => is_writable(storage_path()) && is_writable(base_path('bootstrap/cache')),
            'session cookies are secure and HttpOnly' => (bool) config('session.secure')
                && (bool) config('session.http_only')
                && in_array(config('session.same_site'), ['lax', 'strict'], true),
            'session and cache drivers do not require a persistent worker' => in_array(config('session.driver'), ['file', 'database'], true)
                && in_array(config('cache.default'), ['file', 'database'], true),
            'queue driver does not require a persistent worker' => in_array(config('queue.default'), ['sync', 'database'], true),
            'R2 configuration is present' => $this->configured([
                'services.r2.account_id', 'services.r2.bucket', 'services.r2.access_key_id', 'services.r2.secret_access_key',
            ]),
            'OAuth configuration is present' => $this->configured([
                'services.google_oauth.client_id', 'services.google_oauth.client_secret',
            ]),
            'trusted proxy CIDRs are configured' => $this->hasValidTrustedProxies(),
        ];

        $failed = false;
        foreach ($checks as $label => $passed) {
            $this->line(sprintf('[%s] %s', $passed ? 'OK' : 'FAIL', $label));
            $failed = $failed || ! $passed;
        }

        if ($failed) {
            $this->error('Production configuration is incomplete. No secret values were printed.');

            return self::FAILURE;
        }

        $this->info('Production configuration checks passed.');

        return self::SUCCESS;
    }

    private function configured(array $keys): bool
    {
        foreach ($keys as $key) {
            if (trim((string) config($key)) === '') {
                return false;
            }
        }

        return true;
    }

    private function hasValidAppKey(): bool
    {
        $key = (string) config('app.key');
        if (str_starts_with($key, 'base64:')) {
            $key = (string) base64_decode(substr($key, 7), true);
        }

        return Encrypter::supported($key, (string) config('app.cipher'));
    }

    private function usesHttps(string $url): bool
    {
        return parse_url($url, PHP_URL_SCHEME) === 'https' && parse_url($url, PHP_URL_HOST) !== null;
    }

    private function requiredExtensionsAvailable(): bool
    {
        foreach (['ctype', 'curl', 'fileinfo', 'json', 'mbstring', 'openssl', 'pdo', 'pdo_mysql'] as $extension) {
            if (! extension_loaded($extension)) {
                return false;
            }
        }

        return true;
    }

    private function hasValidTrustedProxies(): bool
    {
        $proxies = config('gisley.network.trusted_proxies');
        if (! is_array($proxies) || $proxies === []) {
            return false;
        }

        foreach ($proxies as $proxy) {
            if (! is_string($proxy) || ! $this->isValidIpOrCidr($proxy)) {
                return false;
            }
        }

        return true;
    }

    private function isValidIpOrCidr(string $value): bool
    {
        [$ip, $prefix] = array_pad(explode('/', trim($value), 2), 2, null);
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        if ($prefix === null) {
            return true;
        }

        if (! ctype_digit($prefix)) {
            return false;
        }

        return (int) $prefix <= (str_contains($ip, ':') ? 128 : 32);
    }
}
