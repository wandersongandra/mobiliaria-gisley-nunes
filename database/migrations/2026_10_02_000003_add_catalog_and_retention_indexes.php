<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->index(['status', 'is_featured', 'updated_at'], 'morada_properties_catalog_idx');
        });

        Schema::table('morada_property_photos', function (Blueprint $table): void {
            $table->index(['property_id', 'is_cover'], 'morada_property_cover_idx');
            $table->index(['property_id', 'sort_order', 'created_at'], 'morada_property_gallery_idx');
        });

        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->index(['created_at', 'id'], 'morada_leads_created_idx');
            $table->index(['status', 'updated_at'], 'morada_leads_retention_idx');
        });
    }

    public function down(): void
    {
        Schema::table('morada_contact_leads', function (Blueprint $table): void {
            $table->dropIndex('morada_leads_retention_idx');
            $table->dropIndex('morada_leads_created_idx');
        });

        Schema::table('morada_property_photos', function (Blueprint $table): void {
            $table->dropIndex('morada_property_gallery_idx');
            $table->dropIndex('morada_property_cover_idx');
        });

        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->dropIndex('morada_properties_catalog_idx');
        });
    }
};
