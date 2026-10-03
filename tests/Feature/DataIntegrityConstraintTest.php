<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DataIntegrityConstraintTest extends TestCase
{
    use RefreshDatabase;

    public function test_property_status_is_restricted_to_supported_values_in_the_database(): void
    {
        $property = app(PropertyService::class)->saveProperty([
            'title' => 'Integridade de status',
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'status' => 'draft',
        ]);

        $this->expectException(QueryException::class);
        DB::table('morada_properties')->where('id', $property['id'])->update(['status' => 'pending']);
    }

    public function test_staff_role_is_restricted_to_manager_or_editor_in_the_database(): void
    {
        DB::table('morada_staff_access')->insert([
            'email' => 'integrity@example.test',
            'open_id' => 'integrity-test-user',
            'name' => 'Teste integridade',
            'role' => 'editor',
            'active' => true,
            'invited_by' => 'manager@example.test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);
        DB::table('morada_staff_access')->where('email', 'integrity@example.test')->update(['role' => 'administrator']);
    }

    public function test_database_allows_only_one_cover_photo_per_property(): void
    {
        $property = app(PropertyService::class)->saveProperty([
            'title' => 'Integridade da capa',
            'location' => 'Lourdes · Belo Horizonte',
            'city' => 'Belo Horizonte',
            'status' => 'draft',
        ]);

        DB::table('morada_property_photos')->insert($this->photo($property['id'], true));

        $this->expectException(QueryException::class);
        DB::table('morada_property_photos')->insert($this->photo($property['id'], true));
    }

    /** @return array<string, mixed> */
    private function photo(string $propertyId, bool $cover): array
    {
        $id = (string) Str::uuid();

        return [
            'id' => $id,
            'property_id' => $propertyId,
            'storage_path' => 'gisley/properties/'.$propertyId.'/'.$id.'.jpg',
            'url' => '/media/gisley/properties/'.$propertyId.'/'.$id.'.jpg',
            'alt_text' => 'Foto de teste',
            'sort_order' => 0,
            'is_cover' => $cover,
            'storage_provider' => 'r2',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 800,
            'height' => 600,
            'created_at' => now(),
        ];
    }
}
