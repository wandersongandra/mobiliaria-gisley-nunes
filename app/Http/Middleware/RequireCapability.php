<?php

namespace App\Http\Middleware;

use App\Services\AdminAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireCapability
{
    public function __construct(private readonly AdminAccessService $access)
    {
    }

    public function handle(Request $request, Closure $next, string $capability): Response
    {
        $admin = $request->attributes->get('admin');

        if (! is_array($admin) || ! $this->access->hasCapability($admin, $capability)) {
            return response()->json(['error' => 'CAPABILITY_REQUIRED'], 403);
        }

        return $next($request);
    }
}
