<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PublicPageRenderTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function publicPageProvider(): array
    {
        return [
            'home' => ['/', 'Imóveis em Belo Horizonte e região | Gisley Nunes'],
            'imoveis' => ['/imoveis', 'Imóveis para comprar ou alugar em Belo Horizonte | Gisley Nunes'],
            'servicos' => ['/servicos', 'Comprar, alugar ou anunciar imóveis | Gisley Nunes'],
            'bairros' => ['/bairros', 'Bairros com imóveis em Belo Horizonte | Gisley Nunes'],
            'sobre' => ['/sobre', 'Sobre | Gisley Nunes Imóveis'],
            'contato' => ['/contato', 'Contato | Gisley Nunes Imóveis'],
            'privacidade' => ['/privacidade', 'Política de privacidade | Gisley Nunes Imóveis'],
        ];
    }

    #[DataProvider('publicPageProvider')]
    public function test_public_html_page_renders_with_expected_title(string $path, string $title): void
    {
        $response = $this->get($path);

        $response->assertOk();
        $response->assertSee($title);
        $response->assertHeader('Content-Type', 'text/html; charset=UTF-8');
    }

    #[DataProvider('publicPageProvider')]
    public function test_inline_scripts_carry_the_nonce_declared_by_the_csp_header(string $path): void
    {
        $response = $this->get($path);
        $response->assertOk();

        $csp = (string) $response->headers->get('Content-Security-Policy');
        $this->assertNotSame('', $csp, 'A página respondeu sem header Content-Security-Policy.');
        $this->assertStringNotContainsString("style-src 'self' 'unsafe-inline'", $csp);

        $this->assertSame(
            1,
            preg_match("/script-src 'self' 'nonce-([A-Za-z0-9_\-]+)'/", $csp, $matches),
            'O header CSP não declara script-src com nonce: '.$csp
        );

        $nonce = $matches[1];
        $this->assertNotSame('', $nonce);
        $response->assertSee('nonce="'.$nonce.'"', false);
    }

    public function test_production_hsts_does_not_lock_unverified_subdomains_to_https(): void
    {
        $this->app->instance('env', 'production');

        $this->get('/')
            ->assertOk()
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    public function test_csp_media_sources_use_the_explicit_asset_allowlist(): void
    {
        config(['services.r2.account_id' => 'account123']);

        $response = $this->get('/');
        $csp = (string) $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString(
            "img-src 'self' https://images.unsplash.com data: blob: https://account123.r2.cloudflarestorage.com",
            $csp
        );
        $this->assertStringContainsString(
            "media-src 'self' https://account123.r2.cloudflarestorage.com",
            $csp
        );
        $this->assertStringNotContainsString('https://*.r2.cloudflarestorage.com', $csp);
        $this->assertStringNotContainsString("img-src 'self' https: data:", $csp);
        $this->assertStringNotContainsString("media-src 'self' https:;", $csp);
    }

    public function test_published_property_page_renders_and_embeds_its_json_payload(): void
    {
        $property = $this->publishPropertyWithCover();

        $response = $this->get('/imoveis/'.$property['slug']);

        $response->assertOk();
        $response->assertSee($property['title']);
        $response->assertSee('<h1>'.$property['title'].'</h1>', false);
        $response->assertSee('property-description-copy', false);
        $response->assertSee('id="property-data"', false);
        $response->assertSee('"slug":"'.$property['slug'].'"', false);
    }

    public function test_published_properties_are_rendered_in_the_catalog_html(): void
    {
        $property = $this->publishPropertyWithCover();

        $this->get('/imoveis')
            ->assertOk()
            ->assertSee($property['title'])
            ->assertSee('/imoveis/'.rawurlencode($property['slug']), false)
            ->assertSee('listing-card-server', false);
    }

    public function test_json_surfaces_are_not_indexable(): void
    {
        $this->get('/api/site')
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

        $this->get('/api/admin/session')
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    public function test_catalog_filter_urls_are_not_indexable(): void
    {
        $this->get('/imoveis?purpose=Alugar')
            ->assertOk()
            ->assertSee('<meta name="robots" content="noindex,follow" />', false);
    }

    public function test_neighborhood_page_renders_for_a_published_property(): void
    {
        $this->publishPropertyWithCover();

        $response = $this->get('/bairros/lourdes');

        $response->assertOk();
        $response->assertSee('Lourdes');
    }

    public function test_unknown_property_slug_renders_the_html_not_found_page(): void
    {
        $response = $this->get('/imoveis/imovel-inexistente');

        $response->assertNotFound();
        $response->assertSee('Imóvel não encontrado | Gisley Nunes Imóveis');
    }

    public function test_unknown_neighborhood_slug_renders_the_html_not_found_page(): void
    {
        $response = $this->get('/bairros/bairro-inexistente');

        $response->assertNotFound();
        $response->assertSee('Bairro não encontrado | Gisley Nunes Imóveis');
    }

    public function test_unmatched_html_route_renders_the_fallback_not_found_page(): void
    {
        $response = $this->get('/rota-que-nao-existe');

        $response->assertNotFound();
        $response->assertSee('Página não encontrada | Gisley Nunes Imóveis');
    }

    public function test_unmatched_api_route_still_returns_json_not_found(): void
    {
        $this->getJson('/api/rota-que-nao-existe')
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
    }

    /**
     * @return array{slug: string, title: string}
     */
    private function publishPropertyWithCover(): array
    {
        $service = app(PropertyService::class);

        $payload = [
            'title' => 'Casa em Lourdes',
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Casa',
            'price' => 850000,
            'description' => 'Casa de teste para renderização da página pública.',
        ];

        $draft = $service->saveProperty($payload + ['status' => 'draft']);

        $photoId = (string) Str::uuid();
        $service->addPhoto([
            'id' => $photoId,
            'property_id' => $draft['id'],
            'storage_path' => 'gisley/properties/'.$draft['id'].'/'.$photoId.'.jpg',
            'url' => 'https://media.example.test/'.$photoId.'.jpg',
            'alt_text' => 'Fachada',
            'sort_order' => 0,
            'is_cover' => 1,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 1200,
            'height' => 800,
            'uploaded_by' => 'manager@example.test',
        ]);

        $published = $service->saveProperty($payload + ['status' => 'published'], $draft['id']);

        return ['slug' => (string) $published['slug'], 'title' => (string) $published['title']];
    }
}
