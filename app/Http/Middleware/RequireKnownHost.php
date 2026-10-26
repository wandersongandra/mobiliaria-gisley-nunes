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

        $currentHost = $this->requestAuthority($request);
        $allowedHosts = array_values(array_unique(array_filter([
            $this->configuredAuthority((string) config('app.url')),
            $this->configuredAuthority((string) config('app.admin_url')),
        ])));

        if ($currentHost === null || $allowedHosts === [] || ! in_array($currentHost, $allowedHosts, true)) {
            return response()->json(['error' => 'MISDIRECTED_REQUEST'], 421);
        }

        return $next($request);
    }

    private function requestAuthority(Request $request): ?string
    {
        $raw = strtolower(trim((string) $request->headers->get('host', '')));
        if ($raw === '' || str_contains($raw, ',') || preg_match('/[\x00-\x20\x7F]/', $raw) === 1) {
            return null;
        }

        $parts = parse_url('http://'.$raw);
        if (! is_array($parts)) {
            return null;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || preg_match('/^[a-z0-9.-]+$/D', $host) !== 1) {
            return null;
        }

        $port = isset($parts['port']) ? (int) $parts['port'] : null;

        return $port !== null && $port !== 443 ? $host.':'.$port : $host;
    }

    private function configuredAuthority(string $url): ?string
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return null;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || preg_match('/^[a-z0-9.-]+$/D', $host) !== 1) {
            return null;
        }

        $port = isset($parts['port']) ? (int) $parts['port'] : null;

        return $port !== null && $port !== 443 ? $host.':'.$port : $host;
    }
}
