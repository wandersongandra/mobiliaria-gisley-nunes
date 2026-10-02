<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('gisley:status', function (): void {
    $this->info('Gisley Nunes Imóveis - Laravel backend ready.');
})->purpose('Show application status');
