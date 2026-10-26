<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProductionDatabaseTlsTest extends TestCase
{
    public function test_production_check_rejects_remote_mysql_without_explicit_tls_verification(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'database.default' => 'mysql',
            'database.connections.mysql.host' => 'db.example.test',
            'database.connections.mysql.options' => [],
        ]);

        $this->artisan('app:production-check')
            ->expectsOutputToContain('[FAIL] remote MySQL TLS verification is configured')
            ->assertFailed();
    }

    public function test_local_mysql_does_not_require_a_remote_certificate(): void
    {
        config([
            'database.default' => 'mysql',
            'database.connections.mysql.host' => 'localhost',
            'database.connections.mysql.options' => [],
        ]);

        $command = $this->artisan('app:production-check');
        $command->expectsOutputToContain('[OK] remote MySQL TLS verification is configured')
            ->assertSuccessful();
    }
}
