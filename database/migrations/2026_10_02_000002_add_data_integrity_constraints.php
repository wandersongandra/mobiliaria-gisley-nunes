<?php

// Escopo atual: Single-tenant. Não há isolamento por proprietário/imobiliária nesta versão.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('morada_properties')->whereNotIn('status', ['draft', 'published', 'archived'])->exists()) {
            throw new RuntimeException('Cannot add property status constraint while unsupported values exist.');
        }

        if (DB::table('morada_staff_access')->whereNotIn('role', ['manager', 'editor'])->exists()) {
            throw new RuntimeException('Cannot add staff role constraint while unsupported values exist.');
        }

        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'pgsql'], true)) {
            DB::statement("ALTER TABLE morada_properties ADD CONSTRAINT morada_properties_status_check CHECK (status IN ('draft', 'published', 'archived'))");
            DB::statement("ALTER TABLE morada_staff_access ADD CONSTRAINT morada_staff_access_role_check CHECK (role IN ('manager', 'editor'))");

            return;
        }

        if ($driver === 'sqlite') {
            DB::unprepared("CREATE TRIGGER morada_properties_status_insert_check BEFORE INSERT ON morada_properties FOR EACH ROW WHEN NEW.status NOT IN ('draft', 'published', 'archived') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: morada_properties_status_check'); END");
            DB::unprepared("CREATE TRIGGER morada_properties_status_update_check BEFORE UPDATE OF status ON morada_properties FOR EACH ROW WHEN NEW.status NOT IN ('draft', 'published', 'archived') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: morada_properties_status_check'); END");
            DB::unprepared("CREATE TRIGGER morada_staff_access_role_insert_check BEFORE INSERT ON morada_staff_access FOR EACH ROW WHEN NEW.role NOT IN ('manager', 'editor') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: morada_staff_access_role_check'); END");
            DB::unprepared("CREATE TRIGGER morada_staff_access_role_update_check BEFORE UPDATE OF role ON morada_staff_access FOR EACH ROW WHEN NEW.role NOT IN ('manager', 'editor') BEGIN SELECT RAISE(ABORT, 'CHECK constraint failed: morada_staff_access_role_check'); END");

            return;
        }

        throw new RuntimeException('Data integrity constraints are not configured for database driver: '.$driver);
    }

    public function down(): void
    {
        $driver = DB::connection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE morada_properties DROP CHECK morada_properties_status_check');
            DB::statement('ALTER TABLE morada_staff_access DROP CHECK morada_staff_access_role_check');

            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE morada_properties DROP CONSTRAINT morada_properties_status_check');
            DB::statement('ALTER TABLE morada_staff_access DROP CONSTRAINT morada_staff_access_role_check');

            return;
        }

        if ($driver === 'sqlite') {
            DB::unprepared('DROP TRIGGER IF EXISTS morada_properties_status_insert_check');
            DB::unprepared('DROP TRIGGER IF EXISTS morada_properties_status_update_check');
            DB::unprepared('DROP TRIGGER IF EXISTS morada_staff_access_role_insert_check');
            DB::unprepared('DROP TRIGGER IF EXISTS morada_staff_access_role_update_check');
        }
    }
};
