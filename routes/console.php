<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('gisley:status', function (): void {
    $this->info('Gisley Nunes Imóveis - Laravel backend ready.');
})->purpose('Show application status');

Schedule::command('gisley:cleanup-orphaned-property-uploads')
    ->dailyAt('03:00')
    ->withoutOverlapping();
