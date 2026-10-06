<?php

namespace Tests\Feature;

use App\Http\Controllers\PageController;
use Illuminate\Http\Request;
use Tests\TestCase;

class AdminOriginRedirectTest extends TestCase
{
    public function test_admin_origin_root_redirects_to_the_login_shell(): void
    {
        config([
            'app.url' => 'https://www.gisleynunesimoveis.com.br',
            'app.admin_url' => 'https://painel.gisleynunesimoveis.com.br',
        ]);
        $this->assertSame('https://www.gisleynunesimoveis.com.br', config('app.url'));
        $this->assertSame('https://painel.gisleynunesimoveis.com.br', config('app.admin_url'));

        $request = Request::create(
            'https://painel.gisleynunesimoveis.com.br/',
            'GET',
        );
        $this->assertSame('painel.gisleynunesimoveis.com.br', $request->getHost());

        $response = app(PageController::class)->home($request);

        $this->assertSame(302, $response->getStatusCode());
        $this->assertSame('/admin', parse_url((string) $response->headers->get('Location'), PHP_URL_PATH));
    }
}
