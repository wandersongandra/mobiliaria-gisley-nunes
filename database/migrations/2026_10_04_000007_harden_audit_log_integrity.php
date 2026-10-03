<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('morada_audit_log', function (Blueprint $table): void {
            $table->char('actor_user_id', 36)->nullable()->after('actor_open_id');
            $table->index(['actor_user_id', 'created_at'], 'morada_audit_actor_user_created_index');
            $table->foreign('actor_user_id', 'morada_audit_actor_user_fk')
                ->references('id')->on('morada_users')->restrictOnDelete();
        });

        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("CREATE TRIGGER morada_audit_log_no_update BEFORE UPDATE ON morada_audit_log BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;");
            DB::unprepared("CREATE TRIGGER morada_audit_log_no_delete BEFORE DELETE ON morada_audit_log BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;");

            return;
        }

        DB::unprepared("CREATE TRIGGER morada_audit_log_no_update BEFORE UPDATE ON morada_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE'");
        DB::unprepared("CREATE TRIGGER morada_audit_log_no_delete BEFORE DELETE ON morada_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE'");
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS morada_audit_log_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS morada_audit_log_no_delete');

        Schema::table('morada_audit_log', function (Blueprint $table): void {
            $table->dropForeign('morada_audit_actor_user_fk');
            $table->dropIndex('morada_audit_actor_user_created_index');
            $table->dropColumn('actor_user_id');
        });
    }
};
