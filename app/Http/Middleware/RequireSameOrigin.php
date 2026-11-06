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

        $sourceOrigin = $this->canonicalOrigin($source);
        if ($sourceOrigin === null) {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
        }

        $allowedOrigins = array_values(array_unique(array_filter([
            $this->canonicalOrigin((string) config('app.url')),
            $this->canonicalOrigin((string) config('app.admin_url')),
        ])));

        // Site público e painel administrativo são origens distintas, ainda
        // que pertençam ao mesmo domínio registrável. Aceitar qualquer origem
        // da allowlist permitiria que uma página pública iniciasse mutações no
        // painel (ou vice-versa) caso a outra camada de CSRF fosse contornada.
        // A origem da requisição precisa ser exatamente a do destino, e ambas
        // devem corresponder a uma autoridade configurada pelo operador.
        $targetOrigin = $this->canonicalOrigin($request->getSchemeAndHttpHost());
        if ($targetOrigin === null
            || ! in_array($targetOrigin, $allowedOrigins, true)
            || ! hash_equals($targetOrigin, $sourceOrigin)) {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
        }

        if (app()->environment('production') && ! str_starts_with($sourceOrigin, 'https://')) {
            return response()->json(['error' => 'INVALID_ORIGIN'], 403);
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
