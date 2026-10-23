<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LimitRequestBody
{
    public function handle(Request $request, Closure $next, string $kilobytes = '256'): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        $limitKb = max(1, min(16384, (int) $kilobytes));
        $maxBytes = $limitKb * 1024;

        $declared = $request->headers->get('Content-Length');
        if (is_string($declared) && preg_match('/^[0-9]+$/D', $declared) === 1 && (int) $declared > $maxBytes) {
            return $this->tooLarge($limitKb);
        }

        // PHP parses multipart uploads into UploadedFile objects. Avoid reading
        // the whole binary body a second time while still enforcing the
        // Content-Length limit above.
        if (str_starts_with(strtolower((string) $request->headers->get('Content-Type')), 'multipart/form-data')) {
            return $next($request);
        }

        if (strlen($request->getContent()) > $maxBytes) {
            return $this->tooLarge($limitKb);
        }

        return $next($request);
    }

    private function tooLarge(int $limitKb): Response
    {
        return response()
            ->json(['error' => 'PAYLOAD_TOO_LARGE', 'max_kb' => $limitKb], 413)
            ->header('Cache-Control', 'no-store');
    }
}
