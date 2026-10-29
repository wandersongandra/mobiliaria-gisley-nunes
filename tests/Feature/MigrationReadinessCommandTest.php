<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MigrationReadinessCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_passes_when_all_migrations_are_applied(): void
    {
        $this->artisan('app:assert-migrations-current')
            ->expectsOutputToContain('All tracked migrations have been applied.')
            ->assertSuccessful();
    }

    public function test_fails_when_a_migration_is_pending(): void
    {
        $migration = DB::table('migrations')->orderByDesc('migration')->first();
        $this->assertNotNull($migration);

        DB::table('migrations')->where('migration', $migration->migration)->delete();

        try {
            $this->artisan('app:assert-migrations-current')
                ->expectsOutputToContain('Pending migrations: '.$migration->migration)
                ->assertFailed();
        } finally {
            DB::table('migrations')->insert([
                'migration' => $migration->migration,
                'batch' => $migration->batch,
            ]);
        }
    }
}
