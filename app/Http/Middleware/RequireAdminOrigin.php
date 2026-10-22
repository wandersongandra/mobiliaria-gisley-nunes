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

        $adminOrigin = $this->canonicalOrigin((string) config('app.admin_url'));
        if ($adminOrigin === null || ! str_starts_with($adminOrigin, 'https://')) {
            return response()->json(['error' => 'ADMIN_ORIGIN_NOT_CONFIGURED'], 503);
        }

        $currentOrigin = $this->canonicalOrigin($request->getSchemeAndHttpHost());
        if ($currentOrigin !== null && hash_equals($adminOrigin, $currentOrigin)) {
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

    private function canonicalOrigin(string $value): ?string
    {
        $parts = parse_url($value);
        if ($parts === false) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        $path = array_key_exists('path', $parts) ? (string) $parts['path'] : '';
        if ($path !== '' && $path !== '/') {
            return null;
        }
        if (array_key_exists('query', $parts)
            || array_key_exists('fragment', $parts)
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)) {
            return null;
        }

        $port = $parts['port'] ?? null;
        if ($port !== null && $port < 1) {
            return null;
        }
        if ($port !== null && ! (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
            return $scheme.'://'.$host.':'.$port;
        }

        return $scheme.'://'.$host;
    }
}
