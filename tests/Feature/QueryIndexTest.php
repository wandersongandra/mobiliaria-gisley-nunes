<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class QueryIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_common_catalog_gallery_lead_and_retention_queries_have_indexes(): void
    {
        $this->assertTrue(Schema::hasIndex('morada_properties', ['status', 'is_featured', 'updated_at']));
        $this->assertTrue(Schema::hasIndex('morada_property_photos', ['property_id', 'is_cover']));
        $this->assertTrue(Schema::hasIndex('morada_property_photos', ['property_id', 'sort_order', 'created_at']));
        $this->assertTrue(Schema::hasIndex('morada_contact_leads', ['created_at', 'id']));
        $this->assertTrue(Schema::hasIndex('morada_contact_leads', ['status', 'updated_at']));
    }
}
