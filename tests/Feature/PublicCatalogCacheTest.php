<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicCatalogCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_catalog_query_is_cached_and_invalidated_after_property_changes(): void
    {
        config(['cache.default' => 'array']);
        Cache::flush();
        $service = app(PropertyService::class);
        $property = $service->saveProperty([
            'title' => 'Casa do Catálogo',
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Casa',
            'status' => 'draft',
        ]);
        $photoId = (string) Str::uuid();
        $service->addPhoto([
            'id' => $photoId,
            'property_id' => $property['id'],
            'storage_path' => 'gisley/properties/'.$property['id'].'/'.$photoId.'.jpg',
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
        $service->saveProperty([
            'title' => 'Casa do Catálogo',
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Casa',
            'status' => 'published',
        ], $property['id']);

        DB::enableQueryLog();
        $this->getJson('/api/properties')
            ->assertOk()
            ->assertJsonCount(1, 'properties')
            ->assertJsonPath('properties.0.slug', 'casa-do-catalogo');
        $this->assertGreaterThan(0, $this->catalogQueryCount());

        DB::flushQueryLog();
        $this->getJson('/api/properties')->assertOk()->assertJsonCount(1, 'properties');
        $this->assertSame(0, $this->catalogQueryCount());

        $service->archiveProperty($property['id']);
        DB::flushQueryLog();
        $this->getJson('/api/properties')->assertOk()->assertJsonCount(0, 'properties');
        $this->assertGreaterThan(0, $this->catalogQueryCount());
    }

    public function test_public_properties_endpoint_populates_the_cache_key_owned_by_the_service(): void
    {
        config(['cache.default' => 'array']);
        Cache::flush();

        $this->assertFalse(Cache::has(PropertyService::PUBLIC_CATALOG_CACHE_KEY));

        $response = $this->getJson('/api/properties');
        $response->assertOk();

        $this->assertTrue(
            Cache::has(PropertyService::PUBLIC_CATALOG_CACHE_KEY),
            'O endpoint /api/properties não preencheu a chave de cache que o PropertyService invalida nas escritas.'
        );

        $this->assertStringContainsString(
            'max-age='.PropertyService::PUBLIC_CATALOG_TTL,
            (string) $response->headers->get('Cache-Control')
        );
    }

    public function test_ssr_and_discovery_routes_share_the_catalog_cache_and_see_writes(): void
    {
        config(['cache.default' => 'array']);
        Cache::flush();
        $service = app(PropertyService::class);
        $property = $this->publishProperty($service, 'Casa dos Bairros');

        // Aquece o cache pela rota JSON.
        $this->getJson('/api/properties')->assertOk()->assertJsonCount(1, 'properties');

        // As rotas SSR e de descoberta devem reaproveitar o mesmo cache, sem
        // consultar morada_properties de novo.
        foreach (['/bairros', '/bairros/lourdes', '/sitemap.xml', '/llms.txt'] as $path) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->get($path)->assertOk();
            $this->assertSame(
                0,
                $this->catalogQueryCount(),
                "A rota {$path} consultou o catálogo em vez de usar o cache compartilhado."
            );
        }

        // Uma escrita precisa invalidar o cache para as rotas HTML também.
        $service->archiveProperty($property['id']);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->get('/bairros')->assertOk()->assertDontSee('Lourdes');
        $this->assertGreaterThan(0, $this->catalogQueryCount());

        $this->get('/sitemap.xml')->assertOk()->assertDontSee('/imoveis/casa-dos-bairros');
        $this->get('/llms.txt')->assertOk()->assertDontSee('casa-dos-bairros');
    }

    /**
     * @return array{id: string}
     */
    private function publishProperty(PropertyService $service, string $title): array
    {
        $payload = [
            'title' => $title,
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Casa',
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

        return ['id' => (string) $published['id']];
    }

    private function catalogQueryCount(): int
    {
        return collect(DB::getQueryLog())
            ->filter(static fn (array $query): bool => str_contains(strtolower($query['query']), 'morada_properties'))
            ->count();
    }
}
