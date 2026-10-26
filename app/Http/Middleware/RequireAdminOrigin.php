<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireAdminOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->environment('production')) {
            return $next($request);
        }

        $adminOrigin = rtrim((string) config('app.admin_url'), '/');
        $expectedAuthority = $this->configuredAuthority($adminOrigin);
        if ($expectedAuthority === null || ! str_starts_with(strtolower($adminOrigin), 'https://')) {
            return response()->json(['error' => 'ADMIN_ORIGIN_NOT_CONFIGURED'], 503);
        }

        $currentAuthority = $this->requestAuthority($request);
        if ($currentAuthority !== null && hash_equals($expectedAuthority, $currentAuthority)) {
            return $next($request);
        }

        $path = '/'.ltrim($request->path(), '/');
        if (in_array($request->method(), ['GET', 'HEAD'], true)
            && ($path === '/admin' || $path === '/api/auth/login')) {
            $query = $request->getQueryString();

            return redirect()->away(
                $adminOrigin.$path.($query !== null && $query !== '' ? '?'.$query : ''),
                307
            );
        }

        return $request->is('api/*') || $request->expectsJson()
            ? response()->json(['error' => 'NOT_FOUND'], 404)
            : response('Not Found', 404);
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

    private function configuredAuthority(string $origin): ?string
    {
        $parts = parse_url($origin);
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
