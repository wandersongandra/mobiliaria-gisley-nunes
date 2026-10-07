<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SeoMigrationCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_commercial_routes_redirect_permanently_to_the_new_architecture(): void
    {
        $this->get('/imoveis-a-venda')
            ->assertStatus(301)
            ->assertRedirect('/imoveis?purpose=Comprar');

        $this->get('/imoveis-para-alugar')
            ->assertStatus(301)
            ->assertRedirect('/imoveis?purpose=Alugar');

        $this->get('/anuncie-seu-imovel')
            ->assertStatus(301)
            ->assertRedirect('/servicos');

        $this->get('/politica-de-privacidade')
            ->assertStatus(301)
            ->assertRedirect('/privacidade');
    }

    public function test_privacy_is_noindex_and_does_not_appear_in_the_sitemap(): void
    {
        $this->get('/privacidade')
            ->assertOk()
            ->assertSee('<meta name="robots" content="noindex,follow"', false);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertDontSee('/privacidade', false);
    }

    public function test_operational_routes_are_disallowed_in_robots(): void
    {
        $response = $this->get('/robots.txt')->assertOk();

        $response->assertSee('Disallow: /api/', false);
        $response->assertSee('Disallow: /admin', false);
        $response->assertSee('Disallow: /_app/', false);
        $response->assertSee('Disallow: /health/', false);
        $response->assertSee('Disallow: /oauth/', false);
    }

    public function test_key_catalog_pages_contain_published_properties_in_initial_html(): void
    {
        $property = $this->publishProperty('Apartamento SEO', 'apartamento-seo-cods-900001', 'Lourdes · Belo Horizonte');

        $this->get('/')
            ->assertOk()
            ->assertSee($property['title'])
            ->assertSee('listing-card-server', false);

        $this->get('/imoveis')
            ->assertOk()
            ->assertSee($property['title'])
            ->assertSee('listing-card-server', false);
    }

    public function test_thin_neighborhood_is_noindex_until_it_has_enough_published_inventory(): void
    {
        $this->publishProperty('Apartamento Lourdes 1', 'apartamento-lourdes-1-cods-910001', 'Lourdes · Belo Horizonte');

        $this->get('/bairros/lourdes')
            ->assertOk()
            ->assertSee('<meta name="robots" content="noindex,follow"', false);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertDontSee('/bairros/lourdes', false);

        $this->publishProperty('Apartamento Lourdes 2', 'apartamento-lourdes-2-cods-910002', 'Lourdes · Belo Horizonte');
        $this->publishProperty('Apartamento Lourdes 3', 'apartamento-lourdes-3-cods-910003', 'Lourdes · Belo Horizonte');

        $this->get('/bairros/lourdes')
            ->assertOk()
            ->assertSee('<meta name="robots" content="index,follow,max-image-preview:large"', false);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('/bairros/lourdes', false);
    }

    public function test_legacy_property_slug_redirects_when_the_import_preserves_the_old_slug(): void
    {
        $property = $this->publishProperty(
            'Casa de condomínio com 3 quartos',
            'casa-de-condominio-com-3-quartos-a-venda-em-belo-horizonte-mg-cods-394601',
            'Santa Mônica · Belo Horizonte'
        );

        $this->get('/'.$property['slug'])
            ->assertStatus(301)
            ->assertRedirect('/imoveis/'.$property['slug']);

        $this->get('/imovel-nao-importado-cods-999999')
            ->assertNotFound();
    }

    /** @return array{slug: string, title: string} */
    private function publishProperty(string $title, string $slug, string $location): array
    {
        $service = app(PropertyService::class);

        $draft = $service->saveProperty([
            'title' => $title,
            'slug' => $slug,
            'location' => $location,
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'price' => 850000,
            'description' => 'Imóvel cadastrado para teste de compatibilidade SEO.',
            'status' => 'draft',
            'featured' => false,
        ]);

        $photoId = (string) Str::uuid();
        $service->addPhoto([
            'id' => $photoId,
            'property_id' => $draft['id'],
            'storage_path' => 'gisley/properties/'.$draft['id'].'/'.$photoId.'.jpg',
            'url' => 'https://media.example.test/'.$photoId.'.jpg',
            'alt_text' => 'Fachada do imóvel',
            'sort_order' => 0,
            'is_cover' => 1,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 1200,
            'height' => 800,
            'uploaded_by' => 'seo-test@example.test',
        ]);

        $published = $service->saveProperty([
            'title' => $title,
            'slug' => $slug,
            'location' => $location,
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'price' => 850000,
            'description' => 'Imóvel cadastrado para teste de compatibilidade SEO.',
            'status' => 'published',
            'featured' => false,
        ], $draft['id']);

        return [
            'slug' => (string) $published['slug'],
            'title' => (string) $published['title'],
        ];
    }
}
