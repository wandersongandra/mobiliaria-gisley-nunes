<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('morada_property_photos')
            || ! Schema::hasColumn('morada_property_photos', 'storage_provider')) {
            return;
        }

        Schema::table('morada_property_photos', function (Blueprint $table): void {
            $table->string('storage_provider', 20)->default('local')->change();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('morada_property_photos')
            || ! Schema::hasColumn('morada_property_photos', 'storage_provider')) {
            return;
        }

        Schema::table('morada_property_photos', function (Blueprint $table): void {
            $table->string('storage_provider', 20)->default('r2')->change();
        });
    }
};
