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
}
