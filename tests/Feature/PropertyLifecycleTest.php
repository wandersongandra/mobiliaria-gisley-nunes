<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class PropertyLifecycleTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    public function test_property_slugs_are_generated_and_unique(): void
    {
        $service = app(PropertyService::class);
        $first = $service->saveProperty($this->propertyInput('Casa Ipê'));
        $second = $service->saveProperty($this->propertyInput('Casa Ipê'));

        $this->assertSame('casa-ipe', $first['slug']);
        $this->assertSame('casa-ipe-2', $second['slug']);
        $this->assertDatabaseCount('morada_properties', 2);
    }

    public function test_explicit_slug_collision_is_reported_as_a_conflict(): void
    {
        $service = app(PropertyService::class);
        $service->saveProperty($this->propertyInput('Casa Ipê', ['slug' => 'casa-ipe']));

        try {
            $service->saveProperty($this->propertyInput('Outra casa', ['slug' => 'casa-ipe']));
            $this->fail('A duplicate explicit slug should be rejected.');
        } catch (RuntimeException $error) {
            $this->assertSame('SLUG_CONFLICT', $error->getMessage());
        }
    }

    public function test_published_property_requires_a_cover_photo(): void
    {
        $service = app(PropertyService::class);
        $property = $service->saveProperty($this->propertyInput('Apartamento Aurora'));

        try {
            $service->saveProperty($this->propertyInput('Apartamento Aurora', ['status' => 'published']), $property['id']);
            $this->fail('A property without a cover must not be published.');
        } catch (RuntimeException $error) {
            $this->assertSame('COVER_REQUIRED', $error->getMessage());
        }

        $service->addPhoto($this->photo($property['id'], 0, true));
        $published = $service->saveProperty($this->propertyInput('Apartamento Aurora', ['status' => 'published']), $property['id']);
        $this->assertSame('published', $published['status']);
        $this->assertSame(1, DB::table('morada_property_photos')->where('property_id', $property['id'])->where('is_cover', true)->count());

        $coverId = (string) DB::table('morada_property_photos')->where('property_id', $property['id'])->value('id');
        try {
            $service->removePhoto($coverId);
            $this->fail('A published property must retain its cover photo.');
        } catch (RuntimeException $error) {
            $this->assertSame('COVER_REQUIRED', $error->getMessage());
        }
    }

    public function test_admin_publish_request_returns_validation_error_without_cover(): void
    {
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
        $response = $this->withSession($this->createManagerSession())
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->postJson('/api/admin/properties', $this->propertyInput('Casa sem capa', ['status' => 'published']));

        $response->assertUnprocessable()->assertJson(['error' => 'COVER_REQUIRED']);
    }

    public function test_cover_and_photo_order_remain_consistent_when_gallery_changes(): void
    {
        $service = app(PropertyService::class);
        $property = $service->saveProperty($this->propertyInput('Casa Jardim'));
        $first = $this->photo($property['id'], 0, true);
        $second = $this->photo($property['id'], 1, false);
        $service->addPhoto($first);
        $service->addPhoto($second);

        $service->setCover($second['id']);
        $ordered = $service->reorderPhotos($property['id'], [$second['id'], $first['id']]);

        $this->assertSame([$second['id'], $first['id']], array_column($ordered, 'id'));
        $this->assertSame(1, DB::table('morada_property_photos')->where('property_id', $property['id'])->where('is_cover', true)->count());
        $this->assertSame($second['id'], DB::table('morada_property_photos')->where('property_id', $property['id'])->where('is_cover', true)->value('id'));
    }

    public function test_archiving_removes_property_from_public_catalog(): void
    {
        $service = app(PropertyService::class);
        $property = $service->saveProperty($this->propertyInput('Casa do Bosque'));
        $service->addPhoto($this->photo($property['id'], 0, true));
        $service->saveProperty($this->propertyInput('Casa do Bosque', ['status' => 'published']), $property['id']);

        $this->assertTrue($service->archiveProperty($property['id']));
        $this->assertSame([], $service->listProperties(publicOnly: true));
        $this->assertSame('archived', $service->getProperty($property['id'])['status']);
    }

    private function propertyInput(string $title, array $overrides = []): array
    {
        return array_merge([
            'title' => $title,
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'purpose' => 'Comprar',
            'type' => 'Apartamento',
            'price' => 850000,
            'priceLabel' => 'R$ 850.000',
            'bedrooms' => 2,
            'bathrooms' => 2,
            'areaM2' => 82.5,
            'suites' => 1,
            'parkingSpots' => 2,
            'condoFee' => 900,
            'iptu' => 2500,
            'description' => 'Imóvel de teste.',
            'status' => 'draft',
            'featured' => false,
        ], $overrides);
    }

    private function photo(string $propertyId, int $sortOrder, bool $isCover): array
    {
        $id = (string) Str::uuid();

        return [
            'id' => $id,
            'property_id' => $propertyId,
            'storage_path' => 'gisley/properties/'.$propertyId.'/'.$id.'.jpg',
            'url' => 'https://media.example.test/'.$id.'.jpg',
            'alt_text' => 'Foto de teste',
            'sort_order' => $sortOrder,
            'is_cover' => $isCover ? 1 : 0,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 12345,
            'width' => 1200,
            'height' => 800,
            'uploaded_by' => 'manager@example.test',
        ];
    }

    private function createManagerSession(): array
    {
        $openId = 'property-manager-'.Str::uuid();
        $jti = (string) Str::uuid();
        $email = 'manager-'.Str::uuid().'@example.test';
        $now = Clock::nowMs();

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => $email,
            'name' => 'Gestor de teste',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor de teste');
        DB::table('morada_staff_access')->insert([
            'email' => $email,
            'open_id' => $openId,
            'name' => 'Gestor de teste',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test@example.test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'user_id' => $identity['user_id'],
            'oauth_identity_id' => $identity['identity_id'],
            'open_id' => $openId,
            'email' => $email,
            'expires_at_ms' => $now + 3_600_000,
            'last_seen_at_ms' => $now,
            'created_at' => now(),
        ]);

        return ['admin_jti' => $jti, 'admin_open_id' => $openId];
    }
}
