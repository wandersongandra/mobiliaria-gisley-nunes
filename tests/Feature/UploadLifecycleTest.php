<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use App\Services\R2Storage;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class UploadLifecycleTest extends TestCase
{
    use CreatesAdminIdentity;
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
        $storage->shouldNotReceive('imageInfo');
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

    public function test_photo_registration_rejects_dimensions_that_do_not_match_the_object(): void
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
            'size' => 1024,
            'contentType' => 'image/jpeg',
        ]);
        $storage->shouldReceive('imageInfo')->once()->andReturn([
            'width' => 1200,
            'height' => 800,
            'mime' => 'image/jpeg',
        ]);
        $storage->shouldReceive('delete')->once();
        $this->app->instance(R2Storage::class, $storage);

        $this->withSession($session)
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
            ])
            ->assertStatus(400)
            ->assertJson(['error' => 'INVALID_ASSET']);
    }

    #[DataProvider('invalidStorageKeys')]
    public function test_storage_key_boundary_rejects_ambiguous_or_unsafe_paths(string $key): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('INVALID_ASSET');

        app(R2Storage::class)->assertKey($key);
    }

    public static function invalidStorageKeys(): array
    {
        return [
            'leading slash' => ['/gisley/properties/id/photo.jpg'],
            'traversal segment' => ['gisley/properties/id/../photo.jpg'],
            'double slash' => ['gisley/properties/id//photo.jpg'],
            'backslash' => ['gisley/properties/id\\photo.jpg'],
            'control character' => ["gisley/properties/id/photo\n.jpg"],
            'unicode key' => ['gisley/properties/id/foto-á.jpg'],
            'wrong prefix' => ['other/properties/id/photo.jpg'],
        ];
    }

    public function test_storage_service_rejects_non_image_presign_even_if_controller_is_bypassed(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('INVALID_FILE');

        app(R2Storage::class)->presignPut(
            'gisley/properties/property-id/file.txt',
            'text/plain',
        );
    }

    public function test_local_storage_resolves_relative_media_root_from_base_path(): void
    {
        config(['services.media.root' => 'storage/app/private/media']);

        $this->assertSame(
            rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, base_path('storage/app/private/media')), DIRECTORY_SEPARATOR),
            R2Storage::configuredMediaRoot(),
        );
    }

    public function test_local_storage_rejects_a_media_root_inside_the_document_root(): void
    {
        config(['services.media.root' => public_path('media')]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('MEDIA_ROOT_INVALID');

        R2Storage::configuredMediaRoot();
    }

    public function test_local_storage_lists_objects_from_the_property_root_without_a_trailing_prefix_segment(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        $path = $root.DIRECTORY_SEPARATOR.'gisley'.DIRECTORY_SEPARATOR.'properties'.DIRECTORY_SEPARATOR.'property-id'.DIRECTORY_SEPARATOR.'photo.jpg';
        File::makeDirectory(dirname($path), 0750, true);
        File::put($path, 'test');

        try {
            $objects = app(R2Storage::class)->listPropertyObjects()['objects'];

            $this->assertCount(1, $objects);
            $this->assertSame('gisley/properties/property-id/photo.jpg', $objects[0]['key']);
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_image_inspection_rejects_a_renamed_payload(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1NwAAAABJRU5ErkJggg==', true);

        $this->assertNotFalse($png);
        $this->assertNull(R2Storage::imageInfoFromBytes($png, 'image/jpeg'));
        $this->assertSame(
            ['width' => 1, 'height' => 1, 'mime' => 'image/png'],
            R2Storage::imageInfoFromBytes($png, 'image/png')
        );
    }

    public function test_multipart_upload_validates_the_real_image_and_uses_the_storage_fake(): void
    {
        config([
            'app.url' => 'https://test.local',
            'app.admin_url' => 'https://test.local',
        ]);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();
        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldReceive('safeFileName')->once()->andReturn('fachada');
        $storage->shouldReceive('putFile')->once()->withArgs(function (
            string $path,
            string $filePath,
            string $contentType,
            int $size
        ) use ($propertyId): bool {
            return str_starts_with($path, R2Storage::PREFIX.$propertyId.'/')
                && is_file($filePath)
                && $contentType === 'image/jpeg'
                && $size > 0;
        });
        $storage->shouldReceive('assetUrl')->once()->andReturn('/media/fachada.jpg');
        $this->app->instance(R2Storage::class, $storage);

        $response = $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->post('/api/admin/properties/'.$propertyId.'/photos/upload', [
                'photo' => UploadedFile::fake()->image('fachada.jpg', 800, 600),
                'altText' => 'Fachada do imóvel',
                'sortOrder' => 0,
                'isCover' => true,
            ]);

        $response->assertCreated()->assertJsonPath('photos.0.alt_text', 'Fachada do imóvel');
        $this->assertDatabaseHas('morada_property_photos', [
            'property_id' => $propertyId,
            'mime_type' => 'image/jpeg',
            'width' => 800,
            'height' => 600,
        ]);
    }

    public function test_multipart_upload_rejects_non_image_bytes_even_with_an_image_extension(): void
    {
        config([
            'app.url' => 'https://test.local',
            'app.admin_url' => 'https://test.local',
        ]);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();
        $storage = Mockery::mock(R2Storage::class)->makePartial();
        $storage->shouldNotReceive('putFile');
        $this->app->instance(R2Storage::class, $storage);

        $this->withSession($session)
            ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
            ->post('/api/admin/properties/'.$propertyId.'/photos/upload', [
                'photo' => UploadedFile::fake()->createWithContent('fachada.jpg', 'not-an-image'),
            ])
            ->assertStatus(400)
            ->assertJson(['error' => 'INVALID_FILE']);
    }

    public function test_multipart_upload_uses_private_local_storage_and_serves_registered_media(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        try {
            config([
                'app.url' => 'https://test.local',
                'app.admin_url' => 'https://test.local',
            ]);
            $propertyId = $this->createDraftProperty();
            $session = $this->createManagerSession();

            $response = $this->withSession($session)
                ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
                ->post('/api/admin/properties/'.$propertyId.'/photos/upload', [
                    'photo' => UploadedFile::fake()->image('fachada.jpg', 800, 600),
                    'altText' => 'Fachada local',
                    'sortOrder' => 0,
                    'isCover' => true,
                ])
                ->assertCreated();

            $photoId = (string) $response->json('photos.0.id');
            $storagePath = (string) DB::table('morada_property_photos')->where('id', $photoId)->value('storage_path');
            $this->assertSame('local', DB::table('morada_property_photos')->where('id', $photoId)->value('storage_provider'));
            $this->assertFileExists($root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $storagePath));

            DB::table('morada_properties')->where('id', $propertyId)->update(['status' => 'published']);

            $this->get('/media/'.$storagePath)
                ->assertOk()
                ->assertHeader('Content-Type', 'image/jpeg');

            $this->withSession($session)
                ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
                ->get('/api/admin/photos/'.$photoId.'/media')
                ->assertOk()
                ->assertHeader('Content-Type', 'image/jpeg');
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_legacy_media_with_active_html_content_is_not_served_inline(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        try {
            $propertyId = $this->createDraftProperty();
            $photoId = (string) Str::uuid();
            $key = R2Storage::PREFIX.$propertyId.'/'.$photoId.'.jpg';
            $file = $root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $key);
            File::ensureDirectoryExists(dirname($file));
            File::put($file, '<!doctype html><html><script>alert(1)</script></html>');

            DB::table('morada_property_photos')->insert([
                'id' => $photoId,
                'property_id' => $propertyId,
                'storage_path' => $key,
                'url' => '/media/'.$key,
                'alt_text' => 'Foto legada',
                'sort_order' => 0,
                'is_cover' => 1,
                'storage_provider' => 'local',
                'mime_type' => 'image/jpeg',
                'file_size' => filesize($file),
                'width' => 800,
                'height' => 600,
                'uploaded_by' => 'manager@example.test',
                'created_at' => now(),
            ]);
            DB::table('morada_properties')->where('id', $propertyId)->update(['status' => 'published']);

            $this->get('/media/'.$key)->assertNotFound();
            $this->withSession($this->createManagerSession())
                ->get('/api/admin/photos/'.$photoId.'/media')
                ->assertNotFound();
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_legacy_presign_flow_uploads_to_local_storage_before_registration(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        try {
            config([
                'app.url' => 'https://test.local',
                'app.admin_url' => 'https://test.local',
            ]);
            $propertyId = $this->createDraftProperty();
            $session = $this->createManagerSession();
            $headers = ['Origin' => 'https://test.local', 'Host' => 'test.local'];

            $file = UploadedFile::fake()->image('fachada.jpg', 640, 480);
            $bytes = file_get_contents($file->getRealPath());
            $this->assertIsString($bytes);

            $presign = $this->withSession($session)
                ->withHeaders($headers)
                ->postJson('/api/admin/uploads/presign', [
                    'propertyId' => $propertyId,
                    'fileName' => 'fachada.jpg',
                    'contentType' => 'image/jpeg',
                    'size' => strlen($bytes),
                ])
                ->assertOk();

            $authorization = (string) $presign->json('uploadHeaders.X-Upload-Authorization');
            $this->assertNotSame('', $authorization);

            $upload = $this->withSession($session)
                ->call(
                    'PUT',
                    $presign->json('uploadUrl'),
                    [],
                    $this->prepareCookiesForRequest(),
                    [],
                    [
                        'HTTP_ORIGIN' => 'https://test.local',
                        'HTTP_HOST' => 'test.local',
                        'CONTENT_TYPE' => 'image/jpeg',
                        'CONTENT_LENGTH' => (string) strlen($bytes),
                        'HTTP_X_UPLOAD_AUTHORIZATION' => $authorization,
                    ],
                    $bytes,
                )
                ->assertCreated();

            $storagePath = (string) $upload->json('storagePath');
            $this->assertFileExists($root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $storagePath));

            $this->withSession($session)
                ->withHeaders($headers)
                ->postJson('/api/admin/properties/'.$propertyId.'/photos', [
                    'storagePath' => $storagePath,
                    'altText' => 'Fachada presign local',
                    'contentType' => 'image/jpeg',
                    'size' => strlen($bytes),
                    'width' => 640,
                    'height' => 480,
                    'sortOrder' => 0,
                    'isCover' => true,
                ])
                ->assertCreated();
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_upload_without_presign_authorization_is_rejected_before_writing(): void
    {
        config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
        $propertyId = $this->createDraftProperty();
        $session = $this->createManagerSession();
        $path = R2Storage::PREFIX.$propertyId.'/'.Str::uuid().'-fachada.jpg';

        $this->withSession($session)->call(
            'PUT',
            '/api/admin/uploads/'.$path,
            [],
            $this->prepareCookiesForRequest(),
            [],
            [
                'HTTP_ORIGIN' => 'https://test.local',
                'HTTP_HOST' => 'test.local',
                'CONTENT_TYPE' => 'image/jpeg',
                'CONTENT_LENGTH' => '4',
            ],
            'fake',
        )->assertForbidden()->assertJson(['error' => 'UPLOAD_AUTH_REQUIRED']);
    }

    public function test_authorized_presigned_put_rejects_fake_image_bytes_without_leaving_a_file(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        try {
            config(['app.url' => 'https://test.local', 'app.admin_url' => 'https://test.local']);
            $propertyId = $this->createDraftProperty();
            $session = $this->createManagerSession();
            $bytes = 'this is not a JPEG file';

            $presign = $this->withSession($session)
                ->withHeaders(['Origin' => 'https://test.local', 'Host' => 'test.local'])
                ->postJson('/api/admin/uploads/presign', [
                    'propertyId' => $propertyId,
                    'fileName' => 'foto.jpg',
                    'contentType' => 'image/jpeg',
                    'size' => strlen($bytes),
                ])
                ->assertOk();

            $storagePath = (string) $presign->json('storagePath');
            $this->withSession($session)
                ->call('PUT', $presign->json('uploadUrl'), [], $this->prepareCookiesForRequest(), [], [
                    'HTTP_ORIGIN' => 'https://test.local',
                    'HTTP_HOST' => 'test.local',
                    'CONTENT_TYPE' => 'image/jpeg',
                    'CONTENT_LENGTH' => (string) strlen($bytes),
                    'HTTP_X_UPLOAD_AUTHORIZATION' => (string) $presign->json('uploadHeaders.X-Upload-Authorization'),
                ], $bytes)
                ->assertStatus(400)
                ->assertJson(['error' => 'INVALID_ASSET']);

            $this->assertFileDoesNotExist($root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $storagePath));
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_local_stream_rejects_invalid_image_contents_and_removes_the_file(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        $storage = app(R2Storage::class);
        $path = R2Storage::PREFIX.Str::uuid().'/forged.jpg';
        $stream = fopen('php://temp', 'w+b');
        $this->assertIsResource($stream);
        $bytes = 'not really a jpeg';
        fwrite($stream, $bytes);
        rewind($stream);

        try {
            try {
                $storage->putStream($path, $stream, 'image/jpeg', strlen($bytes));
                $this->fail('A spoofed Content-Type must not create a stored image.');
            } catch (RuntimeException $error) {
                $this->assertSame('INVALID_ASSET', $error->getMessage());
            }
            $this->assertFalse($storage->exists($path));
        } finally {
            fclose($stream);
            File::deleteDirectory($root);
        }
    }

    public function test_local_stream_upload_rejects_excess_bytes_and_removes_partial_file(): void
    {
        $root = $this->configureTemporaryMediaRoot();
        $storage = app(R2Storage::class);
        $path = R2Storage::PREFIX.Str::uuid().'/oversized.jpg';
        $stream = fopen('php://temp', 'w+b');
        $this->assertIsResource($stream);
        fwrite($stream, str_repeat('x', 1024));
        rewind($stream);

        try {
            try {
                $storage->putStream($path, $stream, 'image/jpeg', 4);
                $this->fail('A request with an inaccurate Content-Length should be rejected.');
            } catch (RuntimeException $error) {
                $this->assertSame('INVALID_FILE', $error->getMessage());
            }
            $this->assertFalse($storage->exists($path));
        } finally {
            fclose($stream);
            File::deleteDirectory($root);
        }
    }

    public function test_image_inspection_rejects_an_image_with_excessive_pixel_area(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1NwAAAABJRU5ErkJggg==', true);

        $this->assertNotFalse($png);

        // getimagesizefromstring() lê as dimensões do IHDR. O arquivo não
        // precisa ser decodificado para que o limite de área seja testado.
        $oversized = substr_replace($png, pack('N', 10_000).pack('N', 5_000), 16, 8);

        $this->assertNull(R2Storage::imageInfoFromBytes($oversized, 'image/png'));
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

    private function configureTemporaryMediaRoot(): string
    {
        $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'gisley-media-'.Str::uuid();
        File::makeDirectory($root, 0750, true);
        config(['services.media.root' => $root]);

        return $root;
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
        $identity = $this->attachAdminIdentity($openId, $email, 'Gestor de teste');
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
            'user_id' => $identity['user_id'],
            'oauth_identity_id' => $identity['identity_id'],
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
