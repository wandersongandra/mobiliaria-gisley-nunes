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
        $expectedHost = strtolower((string) parse_url($adminOrigin, PHP_URL_HOST));
        if ($expectedHost === '' || ! str_starts_with($adminOrigin, 'https://')) {
            return response()->json(['error' => 'ADMIN_ORIGIN_NOT_CONFIGURED'], 503);
        }

        $currentHost = $this->requestHost($request);
        if ($currentHost !== null && hash_equals($expectedHost, $currentHost)) {
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

    private function requestHost(Request $request): ?string
    {
        $raw = strtolower(trim((string) $request->headers->get('host', '')));
        if ($raw === '' || str_contains($raw, ',') || preg_match('/[\x00-\x20\x7F]/', $raw) === 1) {
            return null;
        }

        $host = strtolower((string) parse_url('http://'.$raw, PHP_URL_HOST));

        return $host !== '' && preg_match('/^[a-z0-9.-]+$/D', $host) === 1 ? $host : null;
    }
}
