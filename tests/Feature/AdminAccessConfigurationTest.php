<?php

namespace Tests\Feature;

use App\Services\AdminAccessService;
use App\Support\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesAdminIdentity;
use Tests\TestCase;

class AdminAccessConfigurationTest extends TestCase
{
    use CreatesAdminIdentity;
    use RefreshDatabase;

    public function test_bootstrap_user_ids_are_read_from_gisley_config(): void
    {
        config(['gisley.admin.bootstrap_open_ids' => ['bootstrap-test-user']]);

        $this->assertTrue(app(AdminAccessService::class)->isBootstrap('bootstrap-test-user'));
        $this->assertFalse(app(AdminAccessService::class)->isBootstrap('other-user'));
    }

    public function test_verified_google_bootstrap_emails_are_matched_exactly(): void
    {
        config(['gisley.admin.bootstrap_emails' => ['owner@example.com']]);

        $access = app(AdminAccessService::class);

        $this->assertTrue($access->isBootstrapIdentity('google-subject', 'owner@example.com'));
        $this->assertTrue($access->isBootstrapIdentity('google-subject', 'OWNER@example.com'));
        $this->assertFalse($access->isBootstrapIdentity('other-subject', 'other@example.com'));
    }

    public function test_renamed_config_file_still_reads_the_legacy_gisely_env_names(): void
    {
        // O arquivo passou de gisely.php para gisley.php, mas o .env de produção
        // continua usando GISELY_*. Se alguém "corrigir" esses nomes aqui sem
        // atualizar o deploy, os valores caem silenciosamente para os defaults.
        $names = [
            'GISELY_ADMIN_OPEN_IDS' => 'first-id, second-id',
            'GISELY_ADMIN_IDLE_TIMEOUT_MINUTES' => '45',
            'GISELY_MAX_ADMIN_SESSIONS' => '2',
        ];

        $previous = [];
        foreach (array_keys($names) as $name) {
            $previous[$name] = [
                'getenv' => getenv($name),
                'env' => $_ENV[$name] ?? null,
                'server' => $_SERVER[$name] ?? null,
            ];
            putenv($name.'='.$names[$name]);
            $_ENV[$name] = $names[$name];
            $_SERVER[$name] = $names[$name];
        }

        try {
            /** @var array{admin: array{bootstrap_open_ids: list<string>, idle_timeout_minutes: int, max_sessions: int}} $config */
            $config = require base_path('config/gisley.php');

            $this->assertSame(['first-id', 'second-id'], $config['admin']['bootstrap_open_ids']);
            $this->assertSame(45, $config['admin']['idle_timeout_minutes']);
            $this->assertSame(2, $config['admin']['max_sessions']);
        } finally {
            foreach ($previous as $name => $snapshot) {
                if ($snapshot['getenv'] === false) {
                    putenv($name);
                } else {
                    putenv($name.'='.$snapshot['getenv']);
                }

                if ($snapshot['env'] === null) {
                    unset($_ENV[$name]);
                } else {
                    $_ENV[$name] = $snapshot['env'];
                }

                if ($snapshot['server'] === null) {
                    unset($_SERVER[$name]);
                } else {
                    $_SERVER[$name] = $snapshot['server'];
                }
            }
        }
    }

    public function test_idle_timeout_is_read_from_gisley_config(): void
    {
        config(['gisley.admin.idle_timeout_minutes' => 15]);

        $openId = 'staff-idle-test';
        $jti = (string) Str::uuid();
        $now = Clock::nowMs();

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => 'editor@example.test',
            'name' => 'Editor Teste',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
        $identity = $this->attachAdminIdentity($openId, 'editor@example.test', 'Editor Teste');
        DB::table('morada_staff_access')->insert([
            'email' => 'editor@example.test',
            'open_id' => $openId,
            'name' => 'Editor Teste',
            'role' => 'editor',
            'active' => true,
            'invited_by' => 'manager@example.test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('morada_admin_sessions')->insert([
            'jti' => $jti,
            'user_id' => $identity['user_id'],
            'oauth_identity_id' => $identity['identity_id'],
            'open_id' => $openId,
            'email' => 'editor@example.test',
            'expires_at_ms' => $now + 60 * 60 * 1000,
            'last_seen_at_ms' => $now - 16 * 60 * 1000,
            'created_at' => now(),
        ]);

        $this->withSession(['admin_jti' => $jti, 'admin_open_id' => $openId])
            ->getJson('/api/admin/session')
            ->assertOk()
            ->assertJson(['authenticated' => false, 'user' => null]);

        $this->assertNotNull(DB::table('morada_admin_sessions')->where('jti', $jti)->value('revoked_at'));
    }

    public function test_maximum_admin_sessions_is_read_from_gisley_config(): void
    {
        config(['gisley.admin.max_sessions' => 1]);
        $identity = [
            'openId' => 'staff-session-limit-test',
            'email' => 'editor@example.test',
            'name' => 'Editor Teste',
        ];
        $request = Request::create('/');
        $request->setLaravelSession($this->app['session']->driver());
        $access = app(AdminAccessService::class);

        $access->establish($request, $identity, 'editor');
        $access->establish($request, $identity, 'editor');

        $this->assertSame(
            1,
            DB::table('morada_admin_sessions')->where('open_id', $identity['openId'])->whereNull('revoked_at')->count()
        );
    }
}
