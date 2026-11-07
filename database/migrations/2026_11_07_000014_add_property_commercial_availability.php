<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->string('availability', 20)->default('available');
            $table->index(['status', 'availability', 'updated_at'], 'morada_property_availability_index');
        });
    }

    public function down(): void
    {
        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->dropIndex('morada_property_availability_index');
            $table->dropColumn('availability');
        });
    }
};
