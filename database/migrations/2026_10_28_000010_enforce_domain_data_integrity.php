<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const MAX_UPLOAD_BYTES = 12582912;

    public function up(): void
    {
        $this->assertExistingRowsAreCompatible();

        match (DB::getDriverName()) {
            'mysql' => $this->createMysqlGuards(),
            'pgsql' => $this->createPostgresChecks(),
            'sqlite' => $this->createSqliteGuards(),
            default => throw new RuntimeException('UNSUPPORTED_DATABASE_DRIVER_FOR_DOMAIN_INTEGRITY'),
        };
    }

    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            foreach ($this->triggerNames() as $trigger) {
                DB::unprepared('DROP TRIGGER IF EXISTS '.$trigger);
            }

            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE morada_properties DROP CONSTRAINT IF EXISTS morada_properties_domain_integrity_check');
            DB::statement('ALTER TABLE morada_property_photos DROP CONSTRAINT IF EXISTS morada_property_photos_domain_integrity_check');
            DB::statement('ALTER TABLE morada_contact_leads DROP CONSTRAINT IF EXISTS morada_contact_leads_domain_integrity_check');

            return;
        }

        if ($driver === 'sqlite') {
            foreach ($this->triggerNames() as $trigger) {
                DB::unprepared('DROP TRIGGER IF EXISTS '.$trigger);
            }
        }
    }

    private function assertExistingRowsAreCompatible(): void
    {
        $invalidProperties = DB::table('morada_properties')
            ->where(function ($query): void {
                $query
                    ->whereNotIn('purpose', ['Comprar', 'Alugar'])
                    ->orWhereNotIn('type', ['Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote'])
                    ->orWhereNotIn('status', ['draft', 'published', 'archived'])
                    ->orWhere('price', '<', 0)
                    ->orWhere('bedrooms', '<', 0)
                    ->orWhere('bathrooms', '<', 0)
                    ->orWhere('area_m2', '<', 0)
                    ->orWhere('suites', '<', 0)
                    ->orWhere('parking_spots', '<', 0)
                    ->orWhere('condo_fee', '<', 0)
                    ->orWhere('iptu', '<', 0);
            })
            ->exists();

        $invalidLeads = DB::table('morada_contact_leads')
            ->where(function ($query): void {
                $query
                    ->whereNotIn('status', ['new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost'])
                    ->orWhereNotIn('interest', [
                        'Quero comprar um imóvel',
                        'Quero alugar um imóvel',
                        'Quero anunciar meu imóvel',
                        'Tenho outra dúvida',
                    ]);
            })
            ->exists();

        $invalidManagedPhotos = DB::table('morada_property_photos')
            ->where(function ($query): void {
                $query->whereNotIn('storage_provider', ['r2', 'local', 'legacy'])
                    ->orWhere(function ($query): void {
                        $query->whereIn('storage_provider', ['r2', 'local'])
                            ->where(function ($query): void {
                                $query->whereNull('mime_type')
                                    ->orWhereNotIn('mime_type', ['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
                                    ->orWhere('storage_path', 'not like', 'gisley/properties/%')
                                    ->orWhere('file_size', '<', 1)
                                    ->orWhere('file_size', '>', self::MAX_UPLOAD_BYTES)
                                    ->orWhere('width', '<', 1)
                                    ->orWhere('width', '>', 20000)
                                    ->orWhere('height', '<', 1)
                                    ->orWhere('height', '>', 20000);
                            });
                    });
            })
            ->exists();

        if ($invalidProperties || $invalidLeads || $invalidManagedPhotos) {
            throw new RuntimeException('EXISTING_DATA_VIOLATES_DOMAIN_INTEGRITY');
        }
    }

    private function createMysqlGuards(): void
    {
        DB::unprepared("CREATE TRIGGER morada_properties_domain_insert_guard BEFORE INSERT ON morada_properties FOR EACH ROW
        BEGIN
            IF NEW.purpose NOT IN ('Comprar', 'Alugar')
                OR NEW.type NOT IN ('Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote')
                OR NEW.status NOT IN ('draft', 'published', 'archived')
                OR NEW.price < 0 OR NEW.bedrooms < 0 OR NEW.bathrooms < 0 OR NEW.area_m2 < 0
                OR NEW.suites < 0 OR NEW.parking_spots < 0 OR NEW.condo_fee < 0 OR NEW.iptu < 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PROPERTY_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_properties_domain_update_guard BEFORE UPDATE ON morada_properties FOR EACH ROW
        BEGIN
            IF NEW.purpose NOT IN ('Comprar', 'Alugar')
                OR NEW.type NOT IN ('Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote')
                OR NEW.status NOT IN ('draft', 'published', 'archived')
                OR NEW.price < 0 OR NEW.bedrooms < 0 OR NEW.bathrooms < 0 OR NEW.area_m2 < 0
                OR NEW.suites < 0 OR NEW.parking_spots < 0 OR NEW.condo_fee < 0 OR NEW.iptu < 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PROPERTY_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_insert_guard BEFORE INSERT ON morada_property_photos FOR EACH ROW
        BEGIN
            IF NEW.storage_provider NOT IN ('r2', 'local', 'legacy')
                OR (NEW.storage_provider IN ('r2', 'local') AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > 12582912
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                )) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PHOTO_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_update_guard BEFORE UPDATE ON morada_property_photos FOR EACH ROW
        BEGIN
            IF NEW.storage_provider NOT IN ('r2', 'local', 'legacy')
                OR (NEW.storage_provider IN ('r2', 'local') AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > 12582912
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                )) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PHOTO_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_contact_leads_domain_insert_guard BEFORE INSERT ON morada_contact_leads FOR EACH ROW
        BEGIN
            IF NEW.status NOT IN ('new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost')
                OR NEW.interest NOT IN ('Quero comprar um imóvel', 'Quero alugar um imóvel', 'Quero anunciar meu imóvel', 'Tenho outra dúvida') THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LEAD_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_contact_leads_domain_update_guard BEFORE UPDATE ON morada_contact_leads FOR EACH ROW
        BEGIN
            IF NEW.status NOT IN ('new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost')
                OR NEW.interest NOT IN ('Quero comprar um imóvel', 'Quero alugar um imóvel', 'Quero anunciar meu imóvel', 'Tenho outra dúvida') THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'LEAD_DOMAIN_INTEGRITY';
            END IF;
        END");
    }

    private function createPostgresChecks(): void
    {
        DB::statement("ALTER TABLE morada_properties ADD CONSTRAINT morada_properties_domain_integrity_check CHECK (
            purpose IN ('Comprar', 'Alugar')
            AND type IN ('Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote')
            AND status IN ('draft', 'published', 'archived')
            AND price >= 0 AND bedrooms >= 0 AND bathrooms >= 0 AND area_m2 >= 0
            AND suites >= 0 AND parking_spots >= 0 AND condo_fee >= 0 AND iptu >= 0
        )");
        DB::statement("ALTER TABLE morada_property_photos ADD CONSTRAINT morada_property_photos_domain_integrity_check CHECK (
            storage_provider IN ('r2', 'local', 'legacy')
            AND (storage_provider = 'legacy' OR (
                mime_type IS NOT NULL
                AND
                mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                AND storage_path LIKE 'gisley/properties/%'
                AND file_size BETWEEN 1 AND 12582912
                AND width BETWEEN 1 AND 20000 AND height BETWEEN 1 AND 20000
            ))
        )");
        DB::statement("ALTER TABLE morada_contact_leads ADD CONSTRAINT morada_contact_leads_domain_integrity_check CHECK (
            status IN ('new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost')
            AND interest IN ('Quero comprar um imóvel', 'Quero alugar um imóvel', 'Quero anunciar meu imóvel', 'Tenho outra dúvida')
        )");
    }

    private function createSqliteGuards(): void
    {
        DB::unprepared("CREATE TRIGGER morada_properties_domain_insert_guard BEFORE INSERT ON morada_properties
            FOR EACH ROW WHEN NEW.purpose NOT IN ('Comprar', 'Alugar')
                OR NEW.type NOT IN ('Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote')
                OR NEW.status NOT IN ('draft', 'published', 'archived')
                OR NEW.price < 0 OR NEW.bedrooms < 0 OR NEW.bathrooms < 0 OR NEW.area_m2 < 0
                OR NEW.suites < 0 OR NEW.parking_spots < 0 OR NEW.condo_fee < 0 OR NEW.iptu < 0
            BEGIN SELECT RAISE(ABORT, 'PROPERTY_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_properties_domain_update_guard BEFORE UPDATE ON morada_properties
            FOR EACH ROW WHEN NEW.purpose NOT IN ('Comprar', 'Alugar')
                OR NEW.type NOT IN ('Casa', 'Apartamento', 'Cobertura', 'Terreno', 'Comercial', 'Lote')
                OR NEW.status NOT IN ('draft', 'published', 'archived')
                OR NEW.price < 0 OR NEW.bedrooms < 0 OR NEW.bathrooms < 0 OR NEW.area_m2 < 0
                OR NEW.suites < 0 OR NEW.parking_spots < 0 OR NEW.condo_fee < 0 OR NEW.iptu < 0
            BEGIN SELECT RAISE(ABORT, 'PROPERTY_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_insert_guard BEFORE INSERT ON morada_property_photos
            FOR EACH ROW WHEN NEW.storage_provider NOT IN ('r2', 'local', 'legacy')
                OR (NEW.storage_provider IN ('r2', 'local') AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > 12582912
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                ))
            BEGIN SELECT RAISE(ABORT, 'PHOTO_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_update_guard BEFORE UPDATE ON morada_property_photos
            FOR EACH ROW WHEN NEW.storage_provider NOT IN ('r2', 'local', 'legacy')
                OR (NEW.storage_provider IN ('r2', 'local') AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > 12582912
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                ))
            BEGIN SELECT RAISE(ABORT, 'PHOTO_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_contact_leads_domain_insert_guard BEFORE INSERT ON morada_contact_leads
            FOR EACH ROW WHEN NEW.status NOT IN ('new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost')
                OR NEW.interest NOT IN ('Quero comprar um imóvel', 'Quero alugar um imóvel', 'Quero anunciar meu imóvel', 'Tenho outra dúvida')
            BEGIN SELECT RAISE(ABORT, 'LEAD_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_contact_leads_domain_update_guard BEFORE UPDATE ON morada_contact_leads
            FOR EACH ROW WHEN NEW.status NOT IN ('new', 'em_contato', 'fechado', 'perdido', 'contacted', 'qualified', 'closed', 'lost')
                OR NEW.interest NOT IN ('Quero comprar um imóvel', 'Quero alugar um imóvel', 'Quero anunciar meu imóvel', 'Tenho outra dúvida')
            BEGIN SELECT RAISE(ABORT, 'LEAD_DOMAIN_INTEGRITY'); END");
    }

    /** @return list<string> */
    private function triggerNames(): array
    {
        return [
            'morada_properties_domain_insert_guard',
            'morada_properties_domain_update_guard',
            'morada_property_photos_domain_insert_guard',
            'morada_property_photos_domain_update_guard',
            'morada_contact_leads_domain_insert_guard',
            'morada_contact_leads_domain_update_guard',
        ];
    }
};
