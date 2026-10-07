<?php

use App\Http\Middleware\ConfigureTrustedProxies;
use App\Http\Middleware\LimitRequestBody;
use App\Http\Middleware\RequestContext;
use App\Http\Middleware\RequireAdminOrigin;
use App\Http\Middleware\RequireKnownHost;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\RequireCapability;
use App\Http\Middleware\RequireSameOrigin;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(ConfigureTrustedProxies::class);
        $middleware->append(RequestContext::class);
        $middleware->append(SecurityHeaders::class);
        $middleware->append(RequireKnownHost::class);

        $middleware->validateCsrfTokens(except: [
            'api/contact',
        ]);

        $middleware->alias([
            'same-origin' => RequireSameOrigin::class,
            'body-limit' => LimitRequestBody::class,
            'admin-origin' => RequireAdminOrigin::class,
            'admin' => RequireAdmin::class,
            'capability' => RequireCapability::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (Throwable $e, Request $request): ?Response {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof ValidationException) {
                return response()->json([
                    'message' => 'The given data was invalid.',
                    'errors' => $e->errors(),
                ], 422);
            }

            if ($e instanceof TokenMismatchException
                || ($e instanceof HttpExceptionInterface && $e->getStatusCode() === 419)) {
                return response()->json(['error' => 'CSRF_TOKEN_MISMATCH'], 419);
            }

            report($e);

            $message = $e->getMessage();
            $known = [
                'INVALID_PROPERTY',
                'INVALID_PROPERTY_NUMBER',
                'INVALID_CONTACT',
                'INVALID_FILE',
                'INVALID_ASSET',
                'INVALID_ORDER',
                'INVALID_SITE_SETTINGS',
                'INVALID_TESTIMONIAL',
                'INVALID_LEAD_STATUS',
                'INVALID_INVITATION',
                'INVALID_TEAM_MEMBER',
                'INVALID_EMAIL',
                'INVALID_LIMIT',
                'INVALID_PAIRING_CODE',
                'INVITATION_EMAIL_MISMATCH',
                'TEAM_MEMBER_EXISTS',
                'SLUG_CONFLICT',
                'COVER_REQUIRED',
                'PHOTO_LIMIT_REACHED',
                'CAPABILITY_REQUIRED',
                'ASSET_NOT_UPLOADED',
                'ASSET_ALREADY_REGISTERED',
                'STORAGE_NOT_CONFIGURED',
                'AUTH_REQUIRED',
                'MANAGER_REQUIRED',
                'NOT_FOUND',
            ];

            if (in_array($message, $known, true)) {
                $status = match ($message) {
                    'AUTH_REQUIRED' => 401,
                    'CAPABILITY_REQUIRED', 'MANAGER_REQUIRED' => 403,
                    'NOT_FOUND' => 404,
                    'SLUG_CONFLICT', 'PHOTO_LIMIT_REACHED', 'ASSET_ALREADY_REGISTERED', 'TEAM_MEMBER_EXISTS' => 409,
                    'COVER_REQUIRED' => 422,
                    'STORAGE_NOT_CONFIGURED' => 503,
                    default => 400,
                };

                return response()->json(['error' => $message], $status);
            }

            return response()->json([
                'error' => app()->environment('production') ? 'INTERNAL_ERROR' : $message,
            ], 500);
        });
    })
    ->create();
