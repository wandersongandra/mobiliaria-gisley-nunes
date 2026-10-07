<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement(
                'ALTER TABLE morada_staff_invitations ADD COLUMN active_email TEXT '.
                'GENERATED ALWAYS AS (CASE WHEN accepted_at IS NULL AND revoked_at IS NULL THEN email ELSE NULL END) VIRTUAL'
            );
        } else {
            DB::statement(
                'ALTER TABLE morada_staff_invitations ADD COLUMN active_email VARCHAR(255) '.
                'GENERATED ALWAYS AS (CASE WHEN accepted_at IS NULL AND revoked_at IS NULL THEN email ELSE NULL END) STORED'
            );
        }

        $nowMs = (int) floor(microtime(true) * 1000);
        $seen = [];
        foreach (DB::table('morada_staff_invitations')
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->orderByDesc('created_at')
            ->cursor() as $invitation) {
            $email = strtolower((string) $invitation->email);
            if ((int) $invitation->expires_at_ms <= $nowMs || isset($seen[$email])) {
                DB::table('morada_staff_invitations')->where('token_hash', $invitation->token_hash)
                    ->update(['revoked_at' => now()]);

                continue;
            }
            $seen[$email] = true;
        }

        DB::statement(
            'CREATE UNIQUE INDEX morada_staff_invitations_one_active_email '.
            'ON morada_staff_invitations (active_email)'
        );
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('DROP INDEX morada_staff_invitations_one_active_email');
        } else {
            DB::statement('DROP INDEX morada_staff_invitations_one_active_email ON morada_staff_invitations');
        }

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE morada_staff_invitations DROP COLUMN active_email');
        }
    }
};
