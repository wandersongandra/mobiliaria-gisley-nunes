<?php

namespace App\Http\Middleware;

use App\Services\AdminAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireAdmin
{
    public function __construct(private readonly AdminAccessService $access) {}

    public function handle(Request $request, Closure $next): Response
    {
        $admin = $this->access->current($request);

        if (! $admin) {
            $this->access->clearBrowserSession($request);

            return response()
                ->json(['error' => 'AUTH_REQUIRED', 'login' => true], 401)
                ->header('Cache-Control', 'no-store');
        }

        $request->attributes->set('admin', $admin);

        return $next($request);
    }
}
