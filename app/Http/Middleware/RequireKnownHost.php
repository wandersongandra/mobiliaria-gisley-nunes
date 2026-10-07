<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireKnownHost
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->environment('production')) {
            return $next($request);
        }

        $currentHost = strtolower($request->getHost());
        $allowedHosts = array_values(array_unique(array_filter([
            $this->configuredHost((string) config('app.url')),
            $this->configuredHost((string) config('app.admin_url')),
        ])));

        if ($currentHost === '' || $allowedHosts === [] || ! in_array($currentHost, $allowedHosts, true)) {
            return response()->json(['error' => 'MISDIRECTED_REQUEST'], 421);
        }

        return $next($request);
    }

    private function configuredHost(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host !== '' ? $host : null;
    }
}
