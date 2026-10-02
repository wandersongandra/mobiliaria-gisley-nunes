<?php

use App\Http\Controllers\AdminCrmController;
use App\Http\Controllers\AdminPropertyController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PublicController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PublicController::class, 'home']);
Route::get('/imoveis', [PublicController::class, 'imoveis']);
Route::get('/servicos', [PublicController::class, 'servicos']);
Route::get('/bairros', [PublicController::class, 'bairros']);
Route::get('/bairros/{slug}', [PublicController::class, 'bairro']);
Route::get('/sobre', [PublicController::class, 'sobre']);
Route::get('/contato', [PublicController::class, 'contato']);
Route::get('/privacidade', [PublicController::class, 'privacidade']);
Route::get('/imoveis/{slug}', [PublicController::class, 'imovel']);

Route::get('/robots.txt', [PublicController::class, 'robots']);
Route::get('/sitemap.xml', [PublicController::class, 'sitemap']);
Route::get('/llms.txt', [PublicController::class, 'llms']);

Route::get('/api/properties', [PublicController::class, 'properties']);
Route::get('/api/properties/{slug}', [PublicController::class, 'property']);
Route::get('/api/site', [PublicController::class, 'site']);
Route::post('/api/contact', [PublicController::class, 'contact'])
    ->middleware(['same-origin', 'throttle:contact']);

Route::get('/media/{path}', [PublicController::class, 'media'])->where('path', '.*');

Route::get('/admin', [AdminCrmController::class, 'panel']);

Route::prefix('api/auth')->group(function (): void {
    Route::get('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
    Route::get('/callback', [AuthController::class, 'callback'])->middleware('throttle:auth-callback');
    Route::post('/logout', [AuthController::class, 'logout'])
        ->middleware(['same-origin', 'throttle:admin']);
    Route::post('/logout-all', [AuthController::class, 'logoutAll'])
        ->middleware(['same-origin', 'admin', 'throttle:admin']);
});

Route::get('/api/admin/session', [AuthController::class, 'session'])
    ->middleware('throttle:auth-session');

Route::prefix('api/admin')
    ->middleware(['same-origin', 'admin', 'throttle:admin'])
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

Route::fallback([PublicController::class, 'notFound']);
