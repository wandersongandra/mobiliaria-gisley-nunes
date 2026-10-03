<?php

namespace Tests\Feature;

use App\Services\PropertyService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
}
