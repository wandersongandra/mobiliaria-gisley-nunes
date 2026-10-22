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
            'PHP version is patched against PHP2Shell (CVE-2026-109618/109619)' => $this->isPatchedPhpVersion(),
            'APP_KEY has a supported cipher length' => $this->hasValidAppKey(),
            'APP_URL and ADMIN_ORIGIN use distinct HTTPS hosts' => $this->hasSecureSeparatedOrigins(),
            'MySQL connection settings are present' => config('database.default') === 'mysql'
                && $this->configured(['database.connections.mysql.host', 'database.connections.mysql.database', 'database.connections.mysql.username', 'database.connections.mysql.password']),
            'required PHP extensions are available' => $this->requiredExtensionsAvailable(),
            'session.upload_progress is disabled (PHP2Shell mitigation)' => $this->isUploadProgressDisabled(),
            'post_max_size is bounded to prevent OOM in upload handler' => $this->hasBoundedPostMaxSize(),
            'storage and bootstrap cache directories are writable' => is_writable(storage_path()) && is_writable(base_path('bootstrap/cache')),
            'session cookies are host-bound, secure and HttpOnly' => $this->hasSecureSessionCookie(),
            'session and cache drivers do not require a persistent worker' => in_array(config('session.driver'), ['file', 'database'], true)
                && in_array(config('cache.default'), ['file', 'database'], true),
            'queue driver does not require a persistent worker' => in_array(config('queue.default'), ['sync', 'database'], true),
            'R2 configuration is present' => $this->configured([
                'services.r2.account_id', 'services.r2.bucket', 'services.r2.access_key_id', 'services.r2.secret_access_key',
            ]),
            'OAuth configuration uses secure endpoints and callback path' => $this->hasSecureOAuthConfiguration(),
            'bootstrap identity is configured and valid' => $this->hasValidBootstrapIdentity(),
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

    private function hasSecureSeparatedOrigins(): bool
    {
        $public = $this->canonicalOrigin((string) config('app.url'));
        $admin = $this->canonicalOrigin((string) config('app.admin_url'));
        $publicHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        $adminHost = strtolower((string) parse_url((string) config('app.admin_url'), PHP_URL_HOST));

        return $public !== null
            && $admin !== null
            && str_starts_with($public, 'https://')
            && str_starts_with($admin, 'https://')
            && $publicHost !== ''
            && $adminHost !== ''
            && ! hash_equals($publicHost, $adminHost);
    }

    private function hasSecureOAuthConfiguration(): bool
    {
        if (! $this->configured([
            'services.google_oauth.client_id',
            'services.google_oauth.client_secret',
            'services.google_oauth.authorization_url',
            'services.google_oauth.token_url',
            'services.google_oauth.userinfo_url',
        ])) {
            return false;
        }

        foreach (['authorization_url', 'token_url', 'userinfo_url'] as $key) {
            if (! $this->usesHttps((string) config('services.google_oauth.'.$key))) {
                return false;
            }
        }

        $path = (string) config('services.google_oauth.redirect_path');
        if (
            $path === ''
            || ! str_starts_with($path, '/')
            || str_starts_with($path, '//')
            || str_contains($path, '?')
            || str_contains($path, '#')
            || preg_match('/[\x00-\x1F\x7F]/', $path) === 1
        ) {
            return false;
        }

        return true;
    }

    private function canonicalOrigin(string $url): ?string
    {
        $parts = parse_url($url);
        if ($parts === false) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        // APP_URL e ADMIN_ORIGIN precisam ser origens, não URLs de recurso.
        // Aceitamos apenas a barra final convencional; caminho, query,
        // fragmento ou credenciais mudariam redirects e URLs geradas.
        if (($parts['path'] ?? '') !== '' && ($parts['path'] ?? '') !== '/') {
            return null;
        }
        if (array_key_exists('query', $parts)
            || array_key_exists('fragment', $parts)
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)) {
            return null;
        }

        $port = $parts['port'] ?? null;
        if (is_int($port) && ! (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
            return $scheme.'://'.$host.':'.$port;
        }

        return $scheme.'://'.$host;
    }

    private function hasSecureSessionCookie(): bool
    {
        $cookie = (string) config('session.cookie');
        $domain = config('session.domain');

        return str_starts_with($cookie, '__Host-')
            && (bool) config('session.secure')
            && (bool) config('session.http_only')
            && config('session.path') === '/'
            && ($domain === null || $domain === '')
            && in_array(config('session.same_site'), ['lax', 'strict'], true);
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

    /**
     * Verifica se a versão do PHP está patched contra PHP2Shell
     * (CVE-2026-109618 e CVE-2026-109619). Cada branch suportada tem uma
     * patch release mínima: 8.2.35, 8.3.36, 8.4.27, 8.5.12.
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

        // Branch não mapeada precisa de uma atualização explícita deste gate;
        // não presumimos que uma versão futura esteja livre dos CVEs.
        return false;
    }

    /**
     * Verifica se session.upload_progress está desabilitado, bloqueando o
     * caminho de ataque confirmado para CVE-2026-109619 onde o parser
     * multipart invoca session handling antes do script da aplicação rodar.
     *
     * Em CLI (onde o artisan command roda), os INI settings podem diferir do
     * FPM. Nesse caso, validamos a diretiva versionada em public/.user.ini;
     * o deploy ainda precisa da sonda HTTP para provar o valor efetivo no FPM.
     */
    private function isUploadProgressDisabled(): bool
    {
        $value = PHP_SAPI === 'cli'
            ? $this->userIniValue('session.upload_progress.enabled')
            : (string) ini_get('session.upload_progress.enabled');

        return in_array(strtolower(trim((string) $value)), ['0', 'off', 'false'], true);
    }

    /**
     * Verifica se post_max_size está limitado, prevenindo que um upload
     * malicioso exausta memory_limit dentro do handler de upload-progress
     * (superfície do CVE-2026-109618).
     *
     * Em CLI, lê a mesma diretiva versionada em public/.user.ini; em FPM,
     * consulta o valor efetivo carregado pelo runtime.
     */
    private function hasBoundedPostMaxSize(): bool
    {
        $value = PHP_SAPI === 'cli'
            ? $this->userIniValue('post_max_size')
            : (string) ini_get('post_max_size');
        $value = strtolower(trim((string) $value));
        if ($value === '' || $value === '-1' || $value === '0') {
            return false;
        }

        $bytes = $this->parseIniSize($value);

        return $bytes > 0 && $bytes <= 64 * 1024 * 1024;
    }

    private function userIniValue(string $directive): ?string
    {
        $path = base_path('public/.user.ini');
        if (! is_readable($path)) {
            return null;
        }

        $contents = file_get_contents($path);
        if (! is_string($contents)) {
            return null;
        }

        $pattern = '/^\s*'.preg_quote($directive, '/').'\s*=\s*([^;\r\n]+)\s*(?:;.*)?$/mi';
        if (preg_match($pattern, $contents, $matches) !== 1) {
            return null;
        }

        return trim($matches[1], " \t\"'");
    }

    private function parseIniSize(string $value): int
    {
        $unit = strtolower(substr($value, -1));
        $numeric = (int) $value;

        return match ($unit) {
            'g' => $numeric * 1024 * 1024 * 1024,
            'm' => $numeric * 1024 * 1024,
            'k' => $numeric * 1024,
            default => $numeric,
        };
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

    private function hasValidBootstrapIdentity(): bool
    {
        $openIds = config('gisley.admin.bootstrap_open_ids', []);
        $emails = config('gisley.admin.bootstrap_emails', []);
        if (! is_array($openIds) || ! is_array($emails)) {
            return false;
        }

        $openIds = array_values(array_filter($openIds, 'is_string'));
        $emails = array_values(array_filter($emails, 'is_string'));
        if ($openIds === [] && $emails === []) {
            return false;
        }

        foreach ($openIds as $openId) {
            if (strlen($openId) > 191 || preg_match('/^\S+$/', $openId) !== 1) {
                return false;
            }
        }

        foreach ($emails as $email) {
            if (strlen($email) > 255 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
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

        $prefixLength = (int) $prefix;
        if ($prefixLength === 0) {
            return false;
        }

        return $prefixLength <= (str_contains($ip, ':') ? 128 : 32);
    }
}
