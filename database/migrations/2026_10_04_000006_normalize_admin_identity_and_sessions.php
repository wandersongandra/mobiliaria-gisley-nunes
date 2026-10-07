<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('morada_users', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            // Email é atributo de perfil. Não é chave de identidade nem linka
            // automaticamente contas de provedores distintos.
            $table->string('email', 255)->nullable()->index();
            $table->string('name', 255);
            $table->timestamp('blocked_at')->nullable()->index();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });

        Schema::create('morada_oauth_identities', function (Blueprint $table): void {
            $table->char('id', 36)->primary();
            $table->char('user_id', 36);
            $table->string('provider', 60);
            $table->string('provider_subject', 191);
            $table->string('provider_email', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['provider', 'provider_subject'], 'morada_oauth_identity_subject_unique');
            $table->index(['provider', 'provider_email']);
            $table->foreign('user_id', 'morada_oauth_identity_user_fk')
                ->references('id')->on('morada_users')->restrictOnDelete();
        });

        Schema::table('morada_admin_users', function (Blueprint $table): void {
            $table->char('user_id', 36)->nullable()->after('open_id');
        });

        // O schema legado tratava email como identidade. O índice único precisa
        // virar índice comum antes de aceitar dois subjects distintos com o mesmo
        // email, sem que isso una contas automaticamente.
        Schema::table('morada_admin_users', function (Blueprint $table): void {
            $table->dropUnique('morada_admin_users_email_unique');
            $table->index('email', 'morada_admin_users_email_index');
            $table->unique('user_id', 'morada_admin_users_user_id_unique');
            $table->foreign('user_id', 'morada_admin_users_user_fk')
                ->references('id')->on('morada_users')->restrictOnDelete();
        });

        $provider = 'manus';
        foreach (DB::table('morada_admin_users')->orderBy('open_id')->cursor() as $legacy) {
            $userId = (string) Str::uuid();
            $email = strtolower(trim((string) $legacy->email));

            DB::table('morada_users')->insert([
                'id' => $userId,
                'email' => $email !== '' ? $email : null,
                'name' => (string) $legacy->name,
                'created_at' => $legacy->created_at,
                'updated_at' => $legacy->last_login_at,
            ]);
            DB::table('morada_oauth_identities')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'provider' => $provider,
                'provider_subject' => (string) $legacy->open_id,
                'provider_email' => $email !== '' ? $email : null,
                'created_at' => $legacy->created_at,
                'updated_at' => $legacy->last_login_at,
            ]);
            DB::table('morada_admin_users')->where('open_id', $legacy->open_id)->update(['user_id' => $userId]);
        }

        Schema::table('morada_admin_sessions', function (Blueprint $table): void {
            $table->char('user_id', 36)->nullable()->after('jti');
            $table->char('oauth_identity_id', 36)->nullable()->after('user_id');
            $table->index(['user_id', 'expires_at_ms'], 'morada_admin_sessions_user_expiry_index');
        });

        foreach (DB::table('morada_admin_sessions')->orderBy('jti')->cursor() as $session) {
            $legacy = DB::table('morada_admin_users')->where('open_id', $session->open_id)->first();
            if (! $legacy || ! $legacy->user_id) {
                // A sessão legada sem usuário verificável não pode sobreviver à
                // migração. Ela é revogada, mas mantida para investigação.
                DB::table('morada_admin_sessions')->where('jti', $session->jti)->update(['revoked_at' => now()]);

                continue;
            }

            $identity = DB::table('morada_oauth_identities')
                ->where('user_id', $legacy->user_id)
                ->where('provider', $provider)
                ->where('provider_subject', $session->open_id)
                ->first();

            if (! $identity) {
                DB::table('morada_admin_sessions')->where('jti', $session->jti)->update(['revoked_at' => now()]);

                continue;
            }

            DB::table('morada_admin_sessions')->where('jti', $session->jti)->update([
                'user_id' => $legacy->user_id,
                'oauth_identity_id' => $identity->id,
            ]);
        }

        Schema::table('morada_admin_sessions', function (Blueprint $table): void {
            $table->foreign('user_id', 'morada_admin_sessions_user_fk')
                ->references('id')->on('morada_users')->restrictOnDelete();
            $table->foreign('oauth_identity_id', 'morada_admin_sessions_identity_fk')
                ->references('id')->on('morada_oauth_identities')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('morada_admin_sessions', function (Blueprint $table): void {
            $table->dropForeign('morada_admin_sessions_user_fk');
            $table->dropForeign('morada_admin_sessions_identity_fk');
            $table->dropIndex('morada_admin_sessions_user_expiry_index');
            $table->dropColumn(['user_id', 'oauth_identity_id']);
        });

        Schema::table('morada_admin_users', function (Blueprint $table): void {
            $table->dropForeign('morada_admin_users_user_fk');
            $table->dropUnique('morada_admin_users_user_id_unique');
            $table->dropIndex('morada_admin_users_email_index');
            $table->unique('email', 'morada_admin_users_email_unique');
            $table->dropColumn('user_id');
        });

        Schema::dropIfExists('morada_oauth_identities');
        Schema::dropIfExists('morada_users');
    }
};
