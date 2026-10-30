<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApacheFrontControllerContractTest extends TestCase
{
    public function test_admin_entry_cannot_bypass_laravel_through_the_public_directory(): void
    {
        $htaccess = file_get_contents(public_path('.htaccess'));

        $this->assertIsString($htaccess);

        $adminRule = strpos($htaccess, 'RewriteRule ^admin/?$ index.php [L]');
        $directIndexRule = strpos($htaccess, 'RewriteRule ^admin/index\.html$ /admin [R=308,L,NE]');
        $filesystemBypass = strpos($htaccess, 'RewriteCond %{REQUEST_FILENAME} !-d');

        $this->assertNotFalse($adminRule);
        $this->assertNotFalse($directIndexRule);
        $this->assertNotFalse($filesystemBypass);
        $this->assertLessThan($filesystemBypass, $adminRule);
        $this->assertLessThan($filesystemBypass, $directIndexRule);
    }

    public function test_public_directory_denies_sensitive_artifacts_and_sets_static_security_baseline(): void
    {
        $htaccess = file_get_contents(public_path('.htaccess'));

        $this->assertIsString($htaccess);
        $this->assertStringContainsString('Require all denied', $htaccess);
        $this->assertStringContainsString('composer\\.(?:json|lock)', $htaccess);
        $this->assertStringContainsString('Header always set X-Content-Type-Options "nosniff"', $htaccess);
        $this->assertStringContainsString('Header always set X-Frame-Options "DENY"', $htaccess);
        $this->assertStringContainsString('Header always set Strict-Transport-Security "max-age=31536000"', $htaccess);
    }

    public function test_sensitive_routes_override_the_default_referrer_policy_in_apache(): void
    {
        $htaccess = file_get_contents(public_path('.htaccess'));
        $this->assertIsString($htaccess);
        $this->assertStringContainsString('Header always set Referrer-Policy "strict-origin-when-cross-origin"', $htaccess);

        $rules = array_values(array_filter(
            explode("\n", $htaccess),
            static fn (string $line): bool => str_contains($line, 'Header always set Referrer-Policy "no-referrer"')
        ));
        $this->assertCount(1, $rules);
        $this->assertMatchesRegularExpression('/"expr=%\{THE_REQUEST\} =~ m#([^#]+)#"$/', trim($rules[0]));
        preg_match('/"expr=%\{THE_REQUEST\} =~ m#([^#]+)#"$/', trim($rules[0]), $match);
        $routePattern = '#'.$match[1].'#';

        foreach (['/admin', '/admin/', '/admin/index.html', '/api/admin/properties', '/api/auth/session', '/oauth/google/return?code=secret'] as $path) {
            $this->assertSame(1, preg_match($routePattern, 'GET '.$path.' HTTP/1.1'), $path);
        }

        foreach (['/', '/imoveis', '/api/properties', '/administracao', '/oauth/google/callback'] as $path) {
            $this->assertSame(0, preg_match($routePattern, 'GET '.$path.' HTTP/1.1'), $path);
        }
    }
}
