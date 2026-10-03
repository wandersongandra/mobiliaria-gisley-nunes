<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use App\Services\R2Storage;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class UploadLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_photo_registration_rejects_actual_object_size_mismatch(): void
    {
        config([
            'app.url' => 'https://test.local',
            'app.admin_url' => 'https://test.local',
        ]);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();
        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldReceive('metadata')->once()->andReturn([
            'exists' => true,
            'size' => 12 * 1024 * 1024 + 1,
            'contentType' => 'image/jpeg',
        ]);
        $storage->shouldNotReceive('looksLikeImage');
        $storage->shouldReceive('delete')->once();
        $this->app->instance(R2Storage::class, $storage);

        $response = $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->postJson('/api/admin/properties/'.$propertyId.'/photos', [
                'storagePath' => 'gisley/properties/'.$propertyId.'/photo.jpg',
                'altText' => 'Foto do imóvel',
                'contentType' => 'image/jpeg',
                'size' => 1024,
                'width' => 800,
                'height' => 600,
                'sortOrder' => 0,
                'isCover' => false,
            ]);

        $this->assertSame(400, $response->status(), $response->content());
        $response->assertJson(['error' => 'INVALID_ASSET']);
    }

    #[DataProvider('invalidPhotoMetadata')]
    public function test_photo_registration_rejects_invalid_mime_size_and_dimensions(array $overrides, string $error): void
    {
        config([
            'app.url' => 'https://test.local',
            'app.admin_url' => 'https://test.local',
        ]);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();
        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldNotReceive('metadata');
        $this->app->instance(R2Storage::class, $storage);

        $payload = array_merge([
            'storagePath' => 'gisley/properties/'.$propertyId.'/photo.jpg',
            'altText' => 'Foto do imóvel',
            'contentType' => 'image/jpeg',
            'size' => 1024,
            'width' => 800,
            'height' => 600,
            'sortOrder' => 0,
            'isCover' => false,
        ], $overrides);

        $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->postJson('/api/admin/properties/'.$propertyId.'/photos', $payload)
            ->assertStatus(400)
            ->assertJson(['error' => $error]);
    }

    public static function invalidPhotoMetadata(): array
    {
        return [
            'unsupported mime' => [['contentType' => 'application/octet-stream'], 'INVALID_ASSET'],
            'oversized file' => [['size' => 12 * 1024 * 1024 + 1], 'INVALID_FILE'],
            'zero width' => [['width' => 0], 'INVALID_ASSET'],
            'excessive height' => [['height' => 20001], 'INVALID_ASSET'],
            'sort order at limit' => [['sortOrder' => PropertyService::MAX_PHOTOS], 'INVALID_ASSET'],
            'negative sort order' => [['sortOrder' => -1], 'INVALID_ASSET'],
        ];
    }

    public function test_photo_limit_accepts_the_last_slot_and_rejects_the_next_one(): void
    {
        $propertyId = $this->createDraftProperty();
        $service = app(PropertyService::class);

        // Preenche em lote até restar exatamente uma vaga: chamar addPhoto()
        // 40 vezes custaria 40 transações e deixaria a suíte lenta.
        $rows = [];
        for ($sortOrder = 0; $sortOrder < PropertyService::MAX_PHOTOS - 1; $sortOrder++) {
            $rows[] = $this->photoPayload($propertyId, $sortOrder) + ['created_at' => now()];
        }
        DB::table('morada_property_photos')->insert($rows);

        // Última posição disponível: ainda deve ser aceita.
        $service->addPhoto($this->photoPayload($propertyId, PropertyService::MAX_PHOTOS - 1));

        $this->assertSame(
            PropertyService::MAX_PHOTOS,
            DB::table('morada_property_photos')->where('property_id', $propertyId)->count()
        );

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('PHOTO_LIMIT_REACHED');

        $service->addPhoto($this->photoPayload($propertyId, 0));
    }

    public function test_presign_builds_the_storage_path_from_the_storage_prefix(): void
    {
        config([
            'app.url' => 'https://test.local',
            'app.admin_url' => 'https://test.local',
        ]);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();

        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldReceive('safeFileName')->andReturnUsing(static fn (string $name): string => $name);
        $storage->shouldReceive('presignPut')->once()->andReturn('https://r2.example.test/signed');
        $storage->shouldReceive('assetUrl')->andReturnUsing(static fn (string $key): string => '/media/'.$key);
        $this->app->instance(R2Storage::class, $storage);

        $response = $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->postJson('/api/admin/uploads/presign', [
                'propertyId' => $propertyId,
                'fileName' => 'fachada.jpg',
                'contentType' => 'image/jpeg',
                'size' => 1024,
            ]);

        $response->assertOk();
        $this->assertStringStartsWith(
            R2Storage::PREFIX.$propertyId.'/',
            (string) $response->json('storagePath'),
            'O presign não montou o caminho a partir de R2Storage::PREFIX.'
        );
    }

    public function test_scheduled_cleanup_deletes_old_unregistered_objects_only(): void
    {
        $propertyId = $this->createDraftProperty();
        $registeredPath = 'gisley/properties/'.$propertyId.'/registered.jpg';
        $orphanPath = 'gisley/properties/'.$propertyId.'/orphan.jpg';
        $recentPath = 'gisley/properties/'.$propertyId.'/recent.jpg';

        DB::table('morada_property_photos')->insert([
            'id' => (string) Str::uuid(),
            'property_id' => $propertyId,
            'storage_path' => $registeredPath,
            'url' => '/media/'.$registeredPath,
            'alt_text' => 'Foto registrada',
            'sort_order' => 0,
            'is_cover' => false,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 800,
            'height' => 600,
            'uploaded_by' => 'corretor@example.test',
            'created_at' => now(),
        ]);

        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldReceive('listPropertyObjects')->once()->with(null)->andReturn([
            'objects' => [
                ['key' => $registeredPath, 'last_modified' => now()->subDays(2)],
                ['key' => $orphanPath, 'last_modified' => now()->subDays(2)],
                ['key' => $recentPath, 'last_modified' => now()->subMinutes(20)],
            ],
            'next_token' => null,
        ]);
        $storage->shouldReceive('delete')->once()->with($orphanPath);
        $this->app->instance(R2Storage::class, $storage);

        $this->artisan('gisley:cleanup-orphaned-property-uploads')
            ->assertSuccessful()
            ->expectsOutputToContain('removed 1 orphan upload');
    }

    private function createDraftProperty(): string
    {
        $property = app(PropertyService::class)->saveProperty([
            'title' => 'Apartamento de teste',
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
        ]);

        return $property['id'];
    }

    private function createManagerSession(): array
    {
        $openId = 'manager-upload-test';
        $jti = (string) Str::uuid();
        $email = 'manager@example.test';

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => $email,
            'name' => 'Gestor de teste',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        DB::table('morada_staff_access')->insert([
            'email' => $email,
            'open_id' => $openId,
            'name' => 'Gestor de teste',
            'role' => 'manager',
            'active' => true,
            'invited_by' => 'test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'open_id' => $openId,
            'email' => $email,
            'expires_at_ms' => Clock::nowMs() + 3_600_000,
            'last_seen_at_ms' => Clock::nowMs(),
            'created_at' => now(),
        ]);

        return ['admin_jti' => $jti, 'admin_open_id' => $openId];
    }

    /**
     * @return array<string, mixed>
     */
    private function photoPayload(string $propertyId, int $sortOrder): array
    {
        $photoId = (string) Str::uuid();

        return [
            'id' => $photoId,
            'property_id' => $propertyId,
            'storage_path' => R2Storage::PREFIX.$propertyId.'/'.$photoId.'.jpg',
            'url' => '/media/'.R2Storage::PREFIX.$propertyId.'/'.$photoId.'.jpg',
            'alt_text' => 'Foto '.$sortOrder,
            'sort_order' => $sortOrder,
            'is_cover' => $sortOrder === 0,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 800,
            'height' => 600,
            'uploaded_by' => 'manager@example.test',
        ];
    }
}
