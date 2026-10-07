<?php

use App\Http\Controllers\AdminCrmController;
use App\Http\Controllers\AdminPropertyController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DiscoveryController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\PublicApiController;
use Illuminate\Support\Facades\Route;

Route::get('/_app/health', [HealthController::class, 'live']);
Route::get('/health/live', [HealthController::class, 'live']);
Route::get('/health/ready', [HealthController::class, 'ready']);

Route::get('/', [PageController::class, 'home']);
Route::get('/imoveis', [PageController::class, 'imoveis']);
Route::get('/servicos', [PageController::class, 'servicos']);
Route::get('/bairros', [PageController::class, 'bairros']);
Route::get('/bairros/{slug}', [PageController::class, 'bairro']);
Route::get('/sobre', [PageController::class, 'sobre']);
Route::get('/contato', [PageController::class, 'contato']);
Route::get('/privacidade', [PageController::class, 'privacidade']);
Route::get('/imoveis/{slug}', [PageController::class, 'imovel']);

Route::get('/robots.txt', [DiscoveryController::class, 'robots']);
Route::get('/sitemap.xml', [DiscoveryController::class, 'sitemap']);
Route::get('/llms.txt', [DiscoveryController::class, 'llms']);

Route::get('/api/properties', [PublicApiController::class, 'properties'])->middleware('throttle:public-api');
Route::get('/api/v2/properties', [PublicApiController::class, 'propertiesV2'])->middleware('throttle:public-api');
Route::get('/api/properties/{slug}', [PublicApiController::class, 'property'])->middleware('throttle:public-api');
Route::get('/api/site', [PublicApiController::class, 'site'])->middleware('throttle:public-api');
Route::post('/api/contact', [PublicApiController::class, 'contact'])
    ->middleware(['body-limit:64', 'same-origin', 'throttle:contact']);

Route::get('/media/{path}', [MediaController::class, 'media'])->where('path', '.*');

Route::get('/admin', [AdminCrmController::class, 'panel'])
    ->middleware('admin-origin');

Route::get('/oauth/google/return', [AuthController::class, 'callback'])
    ->middleware(['admin-origin', 'throttle:auth-callback']);

Route::prefix('api/auth')->middleware(['admin-origin', 'body-limit:32'])->group(function (): void {
    Route::get('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
    Route::get('/callback', [AuthController::class, 'callback'])->middleware('throttle:auth-callback');
    Route::post('/logout', [AuthController::class, 'logout'])
        ->middleware(['same-origin', 'throttle:admin']);
    Route::post('/logout-all', [AuthController::class, 'logoutAll'])
        ->middleware(['same-origin', 'admin', 'throttle:admin']);
});

Route::get('/api/admin/session', [AuthController::class, 'session'])
    ->middleware(['admin-origin', 'throttle:auth-session']);

Route::prefix('api/admin')
    ->middleware(['admin-origin', 'body-limit:256', 'same-origin', 'admin', 'throttle:admin'])
    ->group(function (): void {
        Route::get('/properties', [AdminPropertyController::class, 'index'])
            ->middleware('capability:property.read');
        Route::post('/properties', [AdminPropertyController::class, 'store'])
            ->middleware('capability:property.write');
        Route::get('/properties/{id}', [AdminPropertyController::class, 'show'])
            ->middleware('capability:property.read');
        Route::put('/properties/{id}', [AdminPropertyController::class, 'update'])
            ->middleware('capability:property.write');
        Route::delete('/properties/{id}', [AdminPropertyController::class, 'archive'])
            ->middleware(['capability:property.archive', 'throttle:destructive']);

        Route::post('/uploads/presign', [AdminPropertyController::class, 'presign'])
            ->middleware(['capability:media.manage', 'throttle:upload']);
        Route::post('/properties/{id}/photos', [AdminPropertyController::class, 'addPhoto'])
            ->middleware(['capability:media.manage', 'throttle:upload']);
        Route::get('/photos/{id}/media', [AdminPropertyController::class, 'photoMedia'])
            ->middleware('capability:property.read');
        Route::delete('/photos/{id}', [AdminPropertyController::class, 'removePhoto'])
            ->middleware(['capability:media.manage', 'throttle:destructive']);
        Route::put('/properties/{id}/photos/order', [AdminPropertyController::class, 'reorder'])
            ->middleware('capability:media.manage');
        Route::put('/photos/{id}/cover', [AdminPropertyController::class, 'cover'])
            ->middleware('capability:media.manage');

        Route::get('/site', [AdminCrmController::class, 'site'])
            ->middleware('capability:site.read');
        Route::put('/site', [AdminCrmController::class, 'updateSite'])
            ->middleware('capability:site.manage');
        Route::post('/testimonials', [AdminCrmController::class, 'createTestimonial'])
            ->middleware('capability:testimonial.manage');
        Route::delete('/testimonials/{id}', [AdminCrmController::class, 'removeTestimonial'])
            ->middleware(['capability:testimonial.manage', 'throttle:destructive']);

        Route::get('/leads/export', [AdminCrmController::class, 'exportLeads'])
            ->middleware(['capability:lead.read', 'throttle:export']);
        Route::get('/leads', [AdminCrmController::class, 'leads'])
            ->middleware('capability:lead.read');
        Route::patch('/leads/{id}', [AdminCrmController::class, 'updateLead'])
            ->middleware('capability:lead.status');
        Route::delete('/leads/{id}', [AdminCrmController::class, 'deleteLead'])
            ->middleware(['capability:lead.erase', 'throttle:destructive']);

        Route::get('/audit', [AdminCrmController::class, 'auditLog'])
            ->middleware('capability:audit.read');

        Route::get('/team', [AdminCrmController::class, 'team'])
            ->middleware('capability:team.manage');
        Route::post('/team', [AdminCrmController::class, 'createTeamMember'])
            ->middleware('capability:team.manage');
        Route::get('/team/invitations', [AdminCrmController::class, 'invitations'])
            ->middleware('capability:team.manage');
        Route::post('/team/invitations', [AdminCrmController::class, 'createInvitation'])
            ->middleware('capability:team.manage');
        Route::delete('/team/invitations/{email}', [AdminCrmController::class, 'revokeInvitation'])
            ->middleware(['capability:team.manage', 'throttle:destructive']);
        Route::patch('/team/{email}', [AdminCrmController::class, 'updateTeamMember'])
            ->middleware('capability:team.manage');
        Route::delete('/team/{email}', [AdminCrmController::class, 'removeTeamMember'])
            ->middleware(['capability:team.manage', 'throttle:destructive']);
    });

Route::fallback([PageController::class, 'notFound']);
