<?php

return new class extends Migration
{
    private const MAX_UPLOAD_BYTES = 12582912;

    public function up(): void
    {
        match (DB::getDriverName()) {
            'mysql' => $this->replaceMysqlPhotoGuards(),
            'pgsql' => $this->replacePostgresPhotoCheck(),
            'sqlite' => $this->replaceSqlitePhotoGuards(),
            default => throw new RuntimeException('UNSUPPORTED_DATABASE_DRIVER_FOR_LOCAL_STORAGE_PROVIDER'),
        };
    }

    public function down(): void
    {
        match (DB::getDriverName()) {
            'mysql' => $this->replaceMysqlPhotoGuards(false),
            'pgsql' => $this->replacePostgresPhotoCheck(false),
            'sqlite' => $this->replaceSqlitePhotoGuards(false),
            default => throw new RuntimeException('UNSUPPORTED_DATABASE_DRIVER_FOR_LOCAL_STORAGE_PROVIDER'),
        };
    }

    private function replaceMysqlPhotoGuards(bool $allowLocal = true): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS morada_property_photos_domain_insert_guard');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_property_photos_domain_update_guard');

        $providers = $allowLocal ? "'r2', 'local', 'legacy'" : "'r2', 'legacy'";
        $managed = $allowLocal ? "'r2', 'local'" : "'r2'";

        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_insert_guard BEFORE INSERT ON morada_property_photos FOR EACH ROW
        BEGIN
            IF NEW.storage_provider NOT IN ({$providers})
                OR (NEW.storage_provider IN ({$managed}) AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > ".self::MAX_UPLOAD_BYTES."
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                )) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PHOTO_DOMAIN_INTEGRITY';
            END IF;
        END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_update_guard BEFORE UPDATE ON morada_property_photos FOR EACH ROW
        BEGIN
            IF NEW.storage_provider NOT IN ({$providers})
                OR (NEW.storage_provider IN ({$managed}) AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > ".self::MAX_UPLOAD_BYTES."
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                )) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PHOTO_DOMAIN_INTEGRITY';
            END IF;
        END");
    }

    private function replacePostgresPhotoCheck(bool $allowLocal = true): void
    {
        DB::statement('ALTER TABLE morada_property_photos DROP CONSTRAINT IF EXISTS morada_property_photos_domain_integrity_check');

        $providers = $allowLocal ? "'r2', 'local', 'legacy'" : "'r2', 'legacy'";
        $managed = $allowLocal ? "'r2', 'local'" : "'r2'";

        DB::statement("ALTER TABLE morada_property_photos ADD CONSTRAINT morada_property_photos_domain_integrity_check CHECK (
            storage_provider IN ({$providers})
            AND (storage_provider = 'legacy' OR (
                storage_provider IN ({$managed})
                AND mime_type IS NOT NULL
                AND mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                AND storage_path LIKE 'gisley/properties/%'
                AND file_size BETWEEN 1 AND ".self::MAX_UPLOAD_BYTES.'
                AND width BETWEEN 1 AND 20000 AND height BETWEEN 1 AND 20000
            ))
        )');
    }

    private function replaceSqlitePhotoGuards(bool $allowLocal = true): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS morada_property_photos_domain_insert_guard');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_property_photos_domain_update_guard');

        $providers = $allowLocal ? "'r2', 'local', 'legacy'" : "'r2', 'legacy'";
        $managed = $allowLocal ? "'r2', 'local'" : "'r2'";

        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_insert_guard BEFORE INSERT ON morada_property_photos
            FOR EACH ROW WHEN NEW.storage_provider NOT IN ({$providers})
                OR (NEW.storage_provider IN ({$managed}) AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > ".self::MAX_UPLOAD_BYTES."
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                ))
            BEGIN SELECT RAISE(ABORT, 'PHOTO_DOMAIN_INTEGRITY'); END");
        DB::unprepared("CREATE TRIGGER morada_property_photos_domain_update_guard BEFORE UPDATE ON morada_property_photos
            FOR EACH ROW WHEN NEW.storage_provider NOT IN ({$providers})
                OR (NEW.storage_provider IN ({$managed}) AND (
                    NEW.mime_type IS NULL OR NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
                    OR NEW.storage_path NOT LIKE 'gisley/properties/%'
                    OR NEW.file_size < 1 OR NEW.file_size > ".self::MAX_UPLOAD_BYTES."
                    OR NEW.width < 1 OR NEW.width > 20000 OR NEW.height < 1 OR NEW.height > 20000
                ))
            BEGIN SELECT RAISE(ABORT, 'PHOTO_DOMAIN_INTEGRITY'); END");
    }
};
