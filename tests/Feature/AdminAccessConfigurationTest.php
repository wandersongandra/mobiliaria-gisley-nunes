<?php

namespace Tests\Feature;

use App\Services\AdminAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminAccessConfigurationTest extends TestCase
{
    use RefreshDatabase;

    public function test_idle_timeout_is_read_from_gisely_config(): void
    {
        config(['gisely.admin.idle_timeout_minutes' => 15]);

        $openId = 'staff-idle-test';
        $jti = (string) Str::uuid();
        $now = (int) floor(microtime(true) * 1000);

        DB::table('morada_admin_users')->insert([
            'open_id' => $openId,
            'email' => 'editor@example.test',
            'name' => 'Editor Teste',
            'created_at' => now(),
            'last_login_at' => now(),
        ]);
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

    public function test_maximum_admin_sessions_is_read_from_gisely_config(): void
    {
        config(['gisely.admin.max_sessions' => 1]);
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
