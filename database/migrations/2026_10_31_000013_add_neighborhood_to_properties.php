<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_properties', function (Blueprint $table): void {
            // Não inferir bairros a partir de logradouros de imóveis já publicados.
            $table->string('neighborhood', 120)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('morada_properties', function (Blueprint $table): void {
            $table->dropColumn('neighborhood');
        });
    }
};
