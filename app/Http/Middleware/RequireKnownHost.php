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

        $currentHost = $this->requestHost($request);
        $allowedHosts = array_values(array_unique(array_filter([
            $this->configuredHost((string) config('app.url')),
            $this->configuredHost((string) config('app.admin_url')),
        ])));

        if ($currentHost === null || $allowedHosts === [] || ! in_array($currentHost, $allowedHosts, true)) {
            return response()->json(['error' => 'MISDIRECTED_REQUEST'], 421);
        }

        return $next($request);
    }

    private function requestHost(Request $request): ?string
    {
        $raw = strtolower(trim((string) $request->headers->get('host', '')));
        if ($raw === '' || str_contains($raw, ',') || preg_match('/[\x00-\x20\x7F]/', $raw) === 1) {
            return null;
        }

        $host = strtolower((string) parse_url('http://'.$raw, PHP_URL_HOST));
        if ($host === '' || preg_match('/^[a-z0-9.-]+$/D', $host) !== 1) {
            return null;
        }

        return $host;
    }

    private function configuredHost(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $host !== '' ? $host : null;
    }
}
