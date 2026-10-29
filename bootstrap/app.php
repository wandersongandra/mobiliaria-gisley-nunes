<?php

use App\Http\Middleware\ConfigureTrustedProxies;
use App\Http\Middleware\LimitRequestBody;
use App\Http\Middleware\RequestContext;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\RequireAdminOrigin;
use App\Http\Middleware\RequireCapability;
use App\Http\Middleware\RequireKnownHost;
use App\Http\Middleware\RequireSameOrigin;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
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

            if ($e instanceof ThrottleRequestsException) {
                return response()->json(['error' => 'RATE_LIMITED'], 429, $e->getHeaders());
            }

            if ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                $error = match ($status) {
                    400 => 'BAD_REQUEST',
                    401 => 'AUTH_REQUIRED',
                    403 => 'FORBIDDEN',
                    404 => 'NOT_FOUND',
                    405 => 'METHOD_NOT_ALLOWED',
                    409 => 'CONFLICT',
                    413 => 'PAYLOAD_TOO_LARGE',
                    422 => 'UNPROCESSABLE_ENTITY',
                    429 => 'TOO_MANY_REQUESTS',
                    default => $status >= 400 && $status < 500 ? 'HTTP_ERROR' : 'INTERNAL_ERROR',
                };

                if ($status >= 500) {
                    report($e);
                }

                return response()->json(['error' => $error], $status);
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
                'INVALID_PROFILE',
                'INVALID_FORM_TEMPLATE',
                'FORM_TEMPLATE_EXISTS',
                'INVALID_LEAD_ACTIVITY',
                'UPLOAD_AUTH_REQUIRED',
                'UPLOAD_AUTH_INVALID',
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
                'MEDIA_STORAGE_NOT_CONFIGURED',
                'MEDIA_ROOT_INVALID',
                'MEDIA_STORAGE_NOT_WRITABLE',
                'MEDIA_STORAGE_WRITE_FAILED',
                'MEDIA_STORAGE_DELETE_FAILED',
                'ASSET_NOT_FOUND',
                'ASSET_ALREADY_UPLOADED',
                'AUTH_REQUIRED',
                'MANAGER_REQUIRED',
                'NOT_FOUND',
            ];

            if (in_array($message, $known, true)) {
                $status = match ($message) {
                    'AUTH_REQUIRED' => 401,
                    'CAPABILITY_REQUIRED', 'MANAGER_REQUIRED', 'UPLOAD_AUTH_REQUIRED', 'UPLOAD_AUTH_INVALID' => 403,
                    'NOT_FOUND' => 404,
                    'SLUG_CONFLICT', 'PHOTO_LIMIT_REACHED', 'ASSET_ALREADY_REGISTERED', 'TEAM_MEMBER_EXISTS', 'FORM_TEMPLATE_EXISTS' => 409,
                    'COVER_REQUIRED' => 422,
                    'STORAGE_NOT_CONFIGURED', 'MEDIA_STORAGE_NOT_CONFIGURED', 'MEDIA_ROOT_INVALID', 'MEDIA_STORAGE_NOT_WRITABLE',
                    'MEDIA_STORAGE_WRITE_FAILED', 'MEDIA_STORAGE_DELETE_FAILED' => 503,
                    'ASSET_ALREADY_UPLOADED' => 409,
                    'ASSET_NOT_FOUND' => 404,
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
