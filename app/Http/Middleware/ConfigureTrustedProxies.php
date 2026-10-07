<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConfigureTrustedProxies
{
    public function handle(Request $request, Closure $next): Response
    {
        $proxies = config('gisley.network.trusted_proxies', []);
        $proxies = is_array($proxies) ? array_values(array_filter($proxies, 'is_string')) : [];

        // Headers forwarded só são interpretados se REMOTE_ADDR pertence a esta
        // lista implantada. CF-Connecting-IP é ignorado deliberadamente: um
        // cliente direto poderia forjá-lo.
        Request::setTrustedProxies(
            $proxies,
            Request::HEADER_X_FORWARDED_FOR
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT
            | Request::HEADER_X_FORWARDED_PROTO,
        );

        return $next($request);
    }
}
