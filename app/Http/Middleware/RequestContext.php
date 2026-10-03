<?php

namespace App\Http\Middleware;

use App\Support\Tokens;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class RequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $provided = trim((string) $request->headers->get('X-Request-ID', ''));
        $requestId = preg_match('/^[A-Za-z0-9_-]{16,64}$/D', $provided) === 1
            ? $provided
            : Tokens::random(18);

        $request->attributes->set('request_id', $requestId);
        Log::withContext(['request_id' => $requestId]);

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);

        return $response;
    }
}
