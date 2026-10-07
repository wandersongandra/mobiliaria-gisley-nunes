<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * MySQL 5.7 accepts CHECK syntax but does not enforce it. These guards keep
     * the status and role invariants active on the HostGator engine as well as
     * on newer MySQL versions that already enforce the CHECK constraints.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::unprepared("CREATE TRIGGER morada_properties_status_insert_guard BEFORE INSERT ON morada_properties FOR EACH ROW SET NEW.status = IF(NEW.status IN ('draft', 'published', 'archived'), NEW.status, NULL)");
        DB::unprepared("CREATE TRIGGER morada_properties_status_update_guard BEFORE UPDATE ON morada_properties FOR EACH ROW SET NEW.status = IF(NEW.status IN ('draft', 'published', 'archived'), NEW.status, NULL)");
        DB::unprepared("CREATE TRIGGER morada_staff_access_role_insert_guard BEFORE INSERT ON morada_staff_access FOR EACH ROW SET NEW.role = IF(NEW.role IN ('manager', 'editor'), NEW.role, NULL)");
        DB::unprepared("CREATE TRIGGER morada_staff_access_role_update_guard BEFORE UPDATE ON morada_staff_access FOR EACH ROW SET NEW.role = IF(NEW.role IN ('manager', 'editor'), NEW.role, NULL)");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::unprepared('DROP TRIGGER IF EXISTS morada_properties_status_insert_guard');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_properties_status_update_guard');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_staff_access_role_insert_guard');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_staff_access_role_update_guard');
    }
};
