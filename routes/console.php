<?php

use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('gisley:status', function (): void {
    $this->info('Gisley Nunes Imóveis - Laravel backend ready.');
})->purpose('Show application status');

Artisan::command('app:assert-migrations-current', function (Migrator $migrator): int {
    if (! $migrator->repositoryExists()) {
        $this->error('Migration repository is missing.');

        return 1;
    }

    $files = $migrator->getMigrationFiles(database_path('migrations'));
    $ran = $migrator->getRepository()->getRan();
    $pending = array_values(array_diff(array_keys($files), $ran));

    if ($pending !== []) {
        $this->error('Pending migrations: '.implode(', ', $pending));

        return 1;
    }

    $this->info('All tracked migrations have been applied.');

    return 0;
})->purpose('Fail if the production database has unapplied migrations');

Schedule::command('gisley:cleanup-orphaned-property-uploads')
    ->dailyAt('03:00')
    ->withoutOverlapping();

Schedule::command('gisley:anonymize-expired-leads')
    ->dailyAt('03:30')
    ->withoutOverlapping();
