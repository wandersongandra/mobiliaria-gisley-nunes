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

        if (hash_equals($expectedHost, strtolower($request->getHost()))) {
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
}
