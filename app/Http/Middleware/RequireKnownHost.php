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

        $current = $this->canonicalOrigin($request->getSchemeAndHttpHost());
        $allowed = array_values(array_unique(array_filter([
            $this->canonicalOrigin((string) config('app.url')),
            $this->canonicalOrigin((string) config('app.admin_url')),
        ])));

        if ($current === null || $allowed === [] || ! in_array($current, $allowed, true)) {
            return response()->json(['error' => 'MISDIRECTED_REQUEST'], 421);
        }

        return $next($request);
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
