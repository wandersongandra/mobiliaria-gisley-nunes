<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class PropertyEditorialQualityTest extends TestCase
{
    use RefreshDatabase;

    public function test_title_whitespace_is_normalized_before_saving(): void
    {
        $property = app(PropertyService::class)->saveProperty($this->payload([
            'title' => 'Apartamento   de    dois quartos',
            'neighborhood' => '  Santa    Mônica ',
        ]));

        $this->assertSame('Apartamento de dois quartos', $property['title']);
        $this->assertSame('Santa Mônica', $property['neighborhood']);
        $this->assertSame('Apartamento de dois quartos', app(PropertyService::class)->publicProperty($property)['title']);
    }

    public function test_legacy_updates_preserve_an_existing_confirmed_neighborhood(): void
    {
        $service = app(PropertyService::class);
        $property = $service->saveProperty($this->payload(['neighborhood' => 'Lourdes']));

        $legacyRequest = $this->payload(['title' => 'Apartamento reformado']);
        unset($legacyRequest['neighborhood']);
        $updated = $service->saveProperty($legacyRequest, $property['id']);

        $this->assertSame('Lourdes', $updated['neighborhood']);
        $this->assertSame('Lourdes', DB::table('morada_properties')->where('id', $property['id'])->value('neighborhood'));

        $cleared = $service->saveProperty($this->payload(['neighborhood' => '']), $property['id']);
        $this->assertNull($cleared['neighborhood']);
    }

    public function test_street_address_cannot_be_submitted_as_a_neighborhood(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('INVALID_PROPERTY');

        app(PropertyService::class)->normalizeInput($this->payload([
            'neighborhood' => 'Av. Divino Marques Guimarães, 2249',
        ]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Apartamento de dois quartos',
            'location' => 'Rua das Flores, 120',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'status' => 'draft',
        ], $overrides);
    }
}
