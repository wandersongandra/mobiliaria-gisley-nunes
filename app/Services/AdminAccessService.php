<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminAccessService
{
    public const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

    private const ROLE_CAPABILITIES = [
        'editor' => [
            'property.read',
            'property.write',
            'media.manage',
            'site.read',
            'lead.read',
            'lead.status',
        ],
        'manager' => [
            'property.read',
            'property.write',
            'property.publish',
            'property.archive',
            'media.manage',
            'site.read',
            'site.manage',
            'testimonial.manage',
            'lead.read',
            'lead.status',
            'lead.erase',
            'audit.read',
            'team.manage',
        ],
    ];

    public function bootstrapOpenIds(): array
    {
        return array_values(array_filter(array_map(
            static fn (string $value): string => trim($value),
            explode(',', (string) env('GISELY_ADMIN_OPEN_IDS', ''))
        )));
    }

    public function isBootstrap(string $openId): bool
    {
        return $openId !== '' && in_array($openId, $this->bootstrapOpenIds(), true);
    }

    public function hasCapability(?array $admin, string $capability): bool
    {
        if (! $admin) {
            return false;
        }

        return in_array($capability, self::ROLE_CAPABILITIES[$admin['role'] ?? ''] ?? [], true);
    }

    public function current(Request $request): ?array
    {
        $jti = (string) $request->session()->get('admin_jti', '');
        $openId = (string) $request->session()->get('admin_open_id', '');

        if ($jti === '' || $openId === '') {
            return null;
        }

        $now = (int) floor(microtime(true) * 1000);
        $idleTimeoutMs = max(15, min(240, (int) config('gisely.admin.idle_timeout_minutes', 60))) * 60 * 1000;

        $session = DB::table('morada_admin_sessions')
            ->where('jti', $jti)
            ->whereNull('revoked_at')
            ->where('expires_at_ms', '>', $now)
            ->first();

        if (! $session) {
            return null;
        }

        if ((int) $session->last_seen_at_ms > 0 && ($now - (int) $session->last_seen_at_ms) > $idleTimeoutMs) {
            DB::table('morada_admin_sessions')->where('jti', $jti)->update(['revoked_at' => now()]);

            return null;
        }

        $user = DB::table('morada_admin_users')->where('open_id', $openId)->first();
        if (! $user || (string) $session->open_id !== $openId) {
            return null;
        }

        $access = DB::table('morada_staff_access')->where('open_id', $openId)->first();
        $bootstrap = $this->isBootstrap($openId);

        if (! $bootstrap) {
            if (! $access || ! (bool) $access->active) {
                return null;
            }
            if (strtolower((string) $access->email) !== strtolower((string) $user->email)) {
                return null;
            }
        }

        if ($access && (string) $access->invited_by === 'environment' && ! $bootstrap) {
            return null;
        }

        if (($now - (int) $session->last_seen_at_ms) > 60_000) {
            DB::table('morada_admin_sessions')->where('jti', $jti)->update(['last_seen_at_ms' => $now]);
        }

        return [
            'openId' => $openId,
            'email' => strtolower((string) $user->email),
            'name' => (string) $user->name,
            'role' => $bootstrap ? 'manager' : (((string) ($access->role ?? 'editor')) === 'manager' ? 'manager' : 'editor'),
            'bootstrap' => $bootstrap,
        ];
    }

    public function establish(Request $request, array $identity, string $role): array
    {
        $now = (int) floor(microtime(true) * 1000);
        $jti = (string) Str::uuid();
        $expiresAt = $now + self::SESSION_TTL_MS;

        DB::transaction(function () use ($identity, $jti, $expiresAt, $now): void {
            DB::table('morada_admin_users')->updateOrInsert(
                ['open_id' => $identity['openId']],
                [
                    'email' => strtolower($identity['email']),
                    'name' => $identity['name'],
                    'last_login_at' => now(),
                ]
            );

            DB::table('morada_admin_sessions')->insert([
                'jti' => $jti,
                'open_id' => $identity['openId'],
                'email' => strtolower($identity['email']),
                'expires_at_ms' => $expiresAt,
                'last_seen_at_ms' => $now,
                'created_at' => now(),
            ]);
        });

        $request->session()->migrate(true);
        $request->session()->put('admin_jti', $jti);
        $request->session()->put('admin_open_id', $identity['openId']);

        $this->trimSessions($identity['openId'], (int) config('gisely.admin.max_sessions', 3));

        return [
            'openId' => $identity['openId'],
            'email' => strtolower($identity['email']),
            'name' => $identity['name'],
            'role' => $role === 'manager' ? 'manager' : 'editor',
        ];
    }

    public function revokeCurrent(Request $request): void
    {
        $jti = (string) $request->session()->pull('admin_jti', '');
        $request->session()->forget('admin_open_id');

        if ($jti !== '') {
            DB::table('morada_admin_sessions')
                ->where('jti', $jti)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    public function revokeAll(string $openId): int
    {
        return DB::table('morada_admin_sessions')
            ->where('open_id', $openId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function trimSessions(string $openId, int $max): void
    {
        $max = max(1, min(10, $max));

        $active = DB::table('morada_admin_sessions')
            ->where('open_id', $openId)
            ->whereNull('revoked_at')
            ->orderByDesc('created_at')
            ->pluck('jti')
            ->all();

        $toRevoke = array_slice($active, $max);
        if ($toRevoke) {
            DB::table('morada_admin_sessions')
                ->whereIn('jti', $toRevoke)
                ->update(['revoked_at' => now()]);
        }
    }

    public function clearBrowserSession(Request $request): void
    {
        $request->session()->forget(['admin_jti', 'admin_open_id']);
    }
}
