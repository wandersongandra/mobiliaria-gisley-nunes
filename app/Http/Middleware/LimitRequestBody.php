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

        // A chunked request has no safe declared size for this middleware. Do
        // not consume an unbounded body in the application layer; the reverse
        // proxy/PHP limits remain the primary defense.
        $transferEncoding = strtolower(trim((string) $request->headers->get('Transfer-Encoding', '')));
        if ($transferEncoding !== '' && str_contains($transferEncoding, 'chunked')) {
            // TE + CL ambíguos nunca chegam à aplicação como uma requisição
            // confiável; a borda deve normalizar a transferência antes do PHP.
            return $declared === null
                ? $this->lengthRequired($limitKb)
                : $this->ambiguousLength();
        }

        // PHP parses multipart uploads into UploadedFile objects. Avoid reading
        // the whole binary body a second time while still enforcing the
        // Content-Length limit above.
        if (str_starts_with(strtolower((string) $request->headers->get('Content-Type')), 'multipart/form-data')) {
            if (! is_string($declared) || preg_match('/^[0-9]+$/D', $declared) !== 1) {
                return $this->lengthRequired($limitKb);
            }

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

    private function lengthRequired(int $limitKb): Response
    {
        return response()
            ->json(['error' => 'CONTENT_LENGTH_REQUIRED', 'max_kb' => $limitKb], 411)
            ->header('Cache-Control', 'no-store');
    }

    private function ambiguousLength(): Response
    {
        return response()
            ->json(['error' => 'AMBIGUOUS_REQUEST_LENGTH'], 400)
            ->header('Cache-Control', 'no-store');
    }
}
