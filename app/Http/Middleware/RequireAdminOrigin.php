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

        $expected = $this->canonicalOrigin((string) config('app.admin_url'));
        if ($expected === null) {
            return app()->environment('production')
                ? response()->json(['error' => 'ADMIN_ORIGIN_NOT_CONFIGURED'], 503)
                : $next($request);
        }

        $current = $this->canonicalOrigin($request->getSchemeAndHttpHost());
        if ($current !== null && hash_equals($expected, $current)) {
            return $next($request);
        }

        $path = '/'.ltrim($request->path(), '/');
        if (in_array($request->method(), ['GET', 'HEAD'], true)
            && ($path === '/admin' || $path === '/api/auth/login')) {
            $query = $request->getQueryString();

            return redirect()->away(
                $expected.$path.($query !== null && $query !== '' ? '?'.$query : ''),
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
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        if ($port !== null && $port > 0 && ! (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
            return $scheme.'://'.$host.':'.$port;
        }

        return $scheme.'://'.$host;
    }
}
