<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PublicCatalogPaginationTest extends TestCase
{
    use RefreshDatabase;

    public function test_v2_catalog_is_paginated_and_hides_internal_property_ids(): void
    {
        $this->insertPublishedProperties(10);

        $response = $this->getJson('/api/v2/properties?page=1&per_page=20')
            ->assertOk()
            ->assertJsonCount(10, 'properties')
            ->assertJsonPath('pagination.current_page', 1)
            ->assertJsonPath('pagination.per_page', 20)
            ->assertJsonPath('pagination.total', 10);

        $this->assertArrayNotHasKey('id', (array) $response->json('properties.0'));
    }

    public function test_v2_catalog_rejects_unsafe_page_sizes_and_returns_an_empty_page_consistently(): void
    {
        $this->getJson('/api/v2/properties?per_page=101')->assertUnprocessable();
        $this->getJson('/api/v2/properties?per_page=1')->assertUnprocessable();

        $this->getJson('/api/v2/properties?page=2&per_page=20')
            ->assertOk()
            ->assertJsonCount(0, 'properties')
            ->assertJsonPath('pagination.current_page', 2)
            ->assertJsonPath('pagination.total', 0);
    }

    public function test_v2_catalog_filters_in_the_database_and_returns_safe_facets(): void
    {
        $this->insertPublishedProperties(3);
        DB::table('morada_properties')->where('slug', 'imovel-de-catalogo-2')->update([
            'purpose' => 'Alugar',
            'type' => 'Casa',
            'location' => 'Savassi · Belo Horizonte',
            'price' => 7000,
            'bedrooms' => 4,
        ]);
        Cache::forget(PropertyService::PUBLIC_CATALOG_FACETS_CACHE_KEY);

        $this->getJson('/api/v2/properties?purpose=Alugar&type=Casa&location=Savassi%20%C2%B7%20Belo%20Horizonte&price_band=2&bedrooms=4%2B')
            ->assertOk()
            ->assertJsonCount(1, 'properties')
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('properties.0.slug', 'imovel-de-catalogo-2')
            ->assertJsonFragment(['locations' => ['Lourdes · Belo Horizonte', 'Savassi · Belo Horizonte']])
            ->assertJsonFragment(['types' => ['Apartamento', 'Casa']]);
    }

    public function test_v2_catalog_keeps_query_count_bounded_with_ten_thousand_properties(): void
    {
        $this->insertPublishedProperties(10_000);

        DB::enableQueryLog();
        $this->getJson('/api/v2/properties?page=100&per_page=100')
            ->assertOk()
            ->assertJsonCount(100, 'properties')
            ->assertJsonPath('pagination.total', 10_000);

        $propertyQueries = collect(DB::getQueryLog())
            ->filter(static fn (array $query): bool => str_contains($query['query'], 'morada_propert'))
            ->count();

        $this->assertLessThanOrEqual(5, $propertyQueries, 'A paginação pública executou consultas por imóvel.');
    }

    private function insertPublishedProperties(int $count): void
    {
        $now = now();
        $rows = [];

        for ($number = 1; $number <= $count; $number++) {
            $rows[] = [
                'id' => sprintf('00000000-0000-4000-8000-%012d', $number),
                'title' => 'Imóvel de catálogo '.$number,
                'slug' => 'imovel-de-catalogo-'.$number,
                'location' => 'Lourdes · Belo Horizonte',
                'city' => 'Belo Horizonte',
                'purpose' => 'Comprar',
                'type' => 'Apartamento',
                'price' => 500000,
                'price_label' => 'R$ 500.000',
                'bedrooms' => 2,
                'bathrooms' => 2,
                'area_m2' => 80,
                'suites' => 1,
                'parking_spots' => 1,
                'condo_fee' => 500,
                'iptu' => 100,
                'description' => 'Imóvel de teste',
                'status' => 'published',
                'is_featured' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) === 500) {
                DB::table('morada_properties')->insert($rows);
                $rows = [];
            }
        }

        if ($rows !== []) {
            DB::table('morada_properties')->insert($rows);
        }
    }
}
