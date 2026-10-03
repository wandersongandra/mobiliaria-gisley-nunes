<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * A coluna calculada fica nula para fotos comuns e contém property_id para
     * a capa. Índices UNIQUE permitem vários NULLs e, por isso, impõem no
     * banco uma única capa por imóvel sem depender do controller.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement(
                'ALTER TABLE morada_property_photos ADD COLUMN cover_property_id TEXT '.
                'GENERATED ALWAYS AS (CASE WHEN is_cover = 1 THEN property_id ELSE NULL END) VIRTUAL'
            );
        } else {
            DB::statement(
                'ALTER TABLE morada_property_photos ADD COLUMN cover_property_id CHAR(36) '.
                'GENERATED ALWAYS AS (CASE WHEN is_cover = 1 THEN property_id ELSE NULL END) STORED'
            );
        }

        DB::statement(
            'CREATE UNIQUE INDEX morada_property_photos_one_cover_per_property '.
            'ON morada_property_photos (cover_property_id)'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX morada_property_photos_one_cover_per_property');

        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('ALTER TABLE morada_property_photos DROP COLUMN cover_property_id');
    }
};
