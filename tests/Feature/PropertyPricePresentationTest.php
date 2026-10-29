<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use RuntimeException;
use Tests\TestCase;

class PropertyPricePresentationTest extends TestCase
{
    public function test_numeric_price_label_is_formatted_as_brl(): void
    {
        $service = app(PropertyService::class);

        $this->assertSame('R$ 220.000', $service->publicProperty([
            'price_label' => '220000', 'price' => 220000, 'purpose' => 'Comprar',
        ])['price_label']);
        $this->assertSame('R$ 2.500,50 / mês', $service->publicProperty([
            'price_label' => '2500,50', 'price' => 2500.50, 'purpose' => 'Alugar',
        ])['price_label']);
    }

    public function test_existing_commercial_labels_are_preserved(): void
    {
        $service = app(PropertyService::class);
        foreach (['Sob consulta', 'A combinar', 'R$ 850.000'] as $label) {
            $this->assertSame($label, $service->publicProperty([
                'price_label' => $label, 'price' => 850000, 'purpose' => 'Comprar',
            ])['price_label']);
        }
    }

    public function test_empty_or_zero_price_uses_consultation_label(): void
    {
        $service = app(PropertyService::class);
        $this->assertSame('Sob consulta', $service->publicProperty([
            'price_label' => '', 'price' => 0, 'purpose' => 'Comprar',
        ])['price_label']);
    }

    public function test_new_rental_without_custom_label_keeps_fractional_price(): void
    {
        $service = app(PropertyService::class);
        $normalized = $service->normalizeInput([
            'title' => 'Apartamento Centro',
            'location' => 'Belo Horizonte',
            'purpose' => 'Alugar',
            'price' => 2500.50,
        ]);

        $this->assertSame('R$ 2.500,50 / mês', $normalized['price_label']);
    }

    public function test_property_normalization_rejects_array_in_scalar_fields(): void
    {
        $service = app(PropertyService::class);
        $payload = ['title' => 'Casa', 'location' => 'Belo Horizonte'];

        foreach (['title', 'location', 'purpose', 'type', 'status', 'slug'] as $field) {
            try {
                $service->normalizeInput(array_replace($payload, [$field => ['unexpected']]));
                $this->fail('Non-scalar '.$field.' should not be accepted.');
            } catch (RuntimeException $error) {
                $this->assertSame('INVALID_PROPERTY', $error->getMessage());
            }
        }
    }
}
