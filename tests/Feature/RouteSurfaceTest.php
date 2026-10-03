<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Snapshot da superfície HTTP pública da aplicação.
 *
 * Nenhuma URL deste projeto tem nome, então os links estão hardcoded no Blade e
 * no JavaScript: renomear ou remover uma rota quebra o site sem que nenhum
 * outro teste reclame. Este teste existe para tornar qualquer mudança de rota
 * explícita e deliberada.
 */
class RouteSurfaceTest extends TestCase
{
    /**
     * @var list<string>
     */
    private const EXPECTED_ROUTES = [
        'DELETE api/admin/leads/{id}',
        'DELETE api/admin/photos/{id}',
        'DELETE api/admin/properties/{id}',
        'DELETE api/admin/team/invitations/{email}',
        'DELETE api/admin/team/{email}',
        'DELETE api/admin/testimonials/{id}',
        'GET /',
        'GET _app/health',
        'GET admin',
        'GET api/admin/audit',
        'GET api/admin/leads',
        'GET api/admin/leads/export',
        'GET api/admin/photos/{id}/media',
        'GET api/admin/properties',
        'GET api/admin/properties/{id}',
        'GET api/admin/session',
        'GET api/admin/site',
        'GET api/admin/team',
        'GET api/admin/team/invitations',
        'GET api/auth/callback',
        'GET api/auth/login',
        'GET api/properties',
        'GET api/properties/{slug}',
        'GET api/site',
        'GET bairros',
        'GET bairros/{slug}',
        'GET contato',
        'GET health/live',
        'GET health/ready',
        'GET imoveis',
        'GET imoveis/{slug}',
        'GET llms.txt',
        'GET media/{path}',
        'GET privacidade',
        'GET robots.txt',
        'GET servicos',
        'GET sitemap.xml',
        'GET sobre',
        'GET {fallbackPlaceholder}',
        'PATCH api/admin/leads/{id}',
        'PATCH api/admin/team/{email}',
        'POST api/admin/properties',
        'POST api/admin/properties/{id}/photos',
        'POST api/admin/team',
        'POST api/admin/team/invitations',
        'POST api/admin/testimonials',
        'POST api/admin/uploads/presign',
        'POST api/auth/logout',
        'POST api/auth/logout-all',
        'POST api/contact',
        'PUT api/admin/photos/{id}/cover',
        'PUT api/admin/properties/{id}',
        'PUT api/admin/properties/{id}/photos/order',
        'PUT api/admin/site',
    ];

    public function test_application_route_surface_matches_the_snapshot(): void
    {
        $this->assertSame(
            self::EXPECTED_ROUTES,
            $this->applicationRouteSurface(),
            'A superfície de rotas mudou. Se a mudança for intencional, atualize RouteSurfaceTest e documente em README.md na seção "Mudanças de Rotas".'
        );
    }

    public function test_no_application_route_is_named_yet(): void
    {
        $named = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $name = (string) $route->getName();
            if ($name !== '' && ! str_starts_with($name, 'storage.')) {
                $named[] = $name;
            }
        }

        sort($named);

        $this->assertSame([], $named, 'Rotas nomeadas foram adicionadas; atualize este teste de propósito.');
    }

    /**
     * @return list<string>
     */
    private function applicationRouteSurface(): array
    {
        $surface = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (str_starts_with((string) $route->getName(), 'storage.')) {
                continue;
            }

            foreach ($route->methods() as $method) {
                if ($method === 'HEAD') {
                    continue;
                }

                $surface[] = $method.' '.$route->uri();
            }
        }

        $surface = array_values(array_unique($surface));
        sort($surface);

        return $surface;
    }
}
