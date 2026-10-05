<?php

namespace App\Http\Middleware;

use App\Support\Tokens;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Tokens::random(18);
        View::share('cspNonce', $nonce);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->remove('X-Powered-By');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'self'; ".
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; ".
            "script-src 'self' 'nonce-{$nonce}'; ".
            "style-src 'self' https://fonts.googleapis.com; ".
            "font-src 'self' https://fonts.gstatic.com data:; ".
            "img-src 'self' https: data: blob:; ".
            "connect-src 'self' https://*.r2.cloudflarestorage.com; ".
            "media-src 'self' https:; upgrade-insecure-requests"
        );

        if ($request->is('api/admin*') || $request->is('api/auth*') || $request->is('admin*')) {
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set('Pragma', 'no-cache');
        }

        if (app()->environment('production')) {
            // Não inclua subdomínios sem confirmar que todos eles usam HTTPS.
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        return $response;
    }
}
