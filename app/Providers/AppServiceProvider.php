<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        RateLimiter::for('contact', fn (Request $request) => [
            Limit::perMinutes(10, 8)->by('contact:'.$request->ip()),
        ]);

        RateLimiter::for('auth-login', fn (Request $request) => [
            Limit::perMinutes(10, 30)->by('auth-login:'.$request->ip()),
        ]);

        RateLimiter::for('auth-callback', fn (Request $request) => [
            Limit::perMinutes(10, 30)->by('auth-callback:'.$request->ip()),
        ]);

        RateLimiter::for('auth-session', fn (Request $request) => [
            Limit::perMinutes(5, 120)->by('auth-session:'.$request->ip()),
        ]);

        RateLimiter::for('admin', fn (Request $request) => [
            Limit::perMinutes(5, 300)->by('admin:'.$request->ip()),
        ]);

        RateLimiter::for('upload', fn (Request $request) => [
            Limit::perMinutes(10, 120)->by('upload:'.$request->ip()),
        ]);

        RateLimiter::for('destructive', fn (Request $request) => [
            Limit::perMinutes(10, 60)->by('destructive:'.$request->ip()),
        ]);
    }
}
