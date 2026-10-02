<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireSameOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $source = $request->headers->get('Origin') ?: $request->headers->get('Referer');
        if (! is_string($source) || $source === '') {
            return response()->json(['error' => 'ORIGIN_REQUIRED'], 403);
        }

        $sourceHost = parse_url($source, PHP_URL_HOST);
        if (! is_string($sourceHost) || $sourceHost === '') {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
        }

        $allowedHosts = array_values(array_unique(array_filter([
            $request->getHost(),
            parse_url((string) config('app.url'), PHP_URL_HOST),
            parse_url((string) config('app.admin_url'), PHP_URL_HOST),
        ])));

        if (! in_array(strtolower($sourceHost), array_map('strtolower', $allowedHosts), true)) {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
        }

        if (app()->environment('production') && strtolower((string) parse_url($source, PHP_URL_SCHEME)) !== 'https') {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
        }

        return $next($request);
    }
}
