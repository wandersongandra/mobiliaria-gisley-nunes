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

    private function catalogQueryCount(): int
    {
        return collect(DB::getQueryLog())
            ->filter(static fn (array $query): bool => str_contains(strtolower($query['query']), 'morada_properties'))
            ->count();
    }
}
