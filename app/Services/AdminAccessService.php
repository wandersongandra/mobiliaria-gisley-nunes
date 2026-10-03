<?php

namespace App\Services;

use App\Support\Clock;
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

    public function __construct(private readonly AdminIdentityService $identities) {}

    public function bootstrapOpenIds(): array
    {
        $openIds = config('gisley.admin.bootstrap_open_ids', []);

        return is_array($openIds) ? array_values(array_filter($openIds, 'is_string')) : [];
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

        if ($jti === '') {
            return null;
        }

        $now = Clock::nowMs();
        $idleTimeoutMs = max(15, min(240, (int) config('gisley.admin.idle_timeout_minutes', 60))) * 60 * 1000;

        $session = DB::table('morada_admin_sessions')
            ->where('jti', $jti)
            ->whereNull('revoked_at')
            ->where('expires_at_ms', '>', $now)
            ->first();

        if (! $session) {
            return null;
        }

        $userId = (string) ($session->user_id ?? '');
        $identityId = (string) ($session->oauth_identity_id ?? '');
        if ($userId === '' || $identityId === '') {
            return null;
        }

        if ((int) $session->last_seen_at_ms > 0 && ($now - (int) $session->last_seen_at_ms) > $idleTimeoutMs) {
            DB::table('morada_admin_sessions')->where('jti', $jti)->update(['revoked_at' => now()]);

            return null;
        }

        $user = DB::table('morada_users')->where('id', $userId)->whereNull('blocked_at')->first();
        $identity = DB::table('morada_oauth_identities')
            ->where('id', $identityId)
            ->where('user_id', $userId)
            ->first();
        $openId = (string) ($identity->provider_subject ?? '');
        if (! $user || ! $identity || ! hash_equals($openId, (string) $session->open_id)) {
            return null;
        }

        $access = DB::table('morada_staff_access')->where('open_id', $openId)->first();
        $bootstrap = $this->isBootstrap($openId);

        if (! $bootstrap) {
            if (! $access || ! (bool) $access->active) {
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
            'userId' => $userId,
            'identityId' => $identityId,
            'email' => strtolower((string) $user->email),
            'name' => (string) $user->name,
            'role' => $bootstrap ? 'manager' : (((string) ($access->role ?? 'editor')) === 'manager' ? 'manager' : 'editor'),
            'bootstrap' => $bootstrap,
        ];
    }

    public function establish(Request $request, array $identity, string $role): array
    {
        $identity += [
            'provider' => (string) config('services.manus_oauth.provider', 'manus'),
            'providerSubject' => (string) ($identity['openId'] ?? ''),
        ];
        $resolved = $this->identities->resolve($identity);
        $now = Clock::nowMs();
        $jti = (string) Str::uuid();
        $expiresAt = $now + self::SESSION_TTL_MS;

        DB::transaction(function () use ($resolved, $jti, $expiresAt, $now): void {
            DB::table('morada_admin_sessions')->insert([
                'jti' => $jti,
                'user_id' => $resolved['userId'],
                'oauth_identity_id' => $resolved['identityId'],
                'open_id' => $resolved['openId'],
                'email' => $resolved['email'],
                'expires_at_ms' => $expiresAt,
                'last_seen_at_ms' => $now,
                'created_at' => now(),
            ]);
        });

        $request->session()->migrate(true);
        $request->session()->put('admin_jti', $jti);
        $request->session()->put('admin_user_id', $resolved['userId']);

        $this->trimSessions($resolved['userId'], (int) config('gisley.admin.max_sessions', 3));

        return [
            'openId' => $resolved['openId'],
            'userId' => $resolved['userId'],
            'identityId' => $resolved['identityId'],
            'email' => $resolved['email'],
            'name' => $resolved['name'],
            'role' => $role === 'manager' ? 'manager' : 'editor',
        ];
    }

    public function revokeCurrent(Request $request): void
    {
        $jti = (string) $request->session()->pull('admin_jti', '');
        $request->session()->forget('admin_user_id');

        if ($jti !== '') {
            DB::table('morada_admin_sessions')
                ->where('jti', $jti)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    public function revokeAll(string $userId): int
    {
        return DB::table('morada_admin_sessions')
            ->where('user_id', $userId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function revokeAllForOpenId(string $openId): int
    {
        $userId = DB::table('morada_oauth_identities')
            ->where('provider', (string) config('services.manus_oauth.provider', 'manus'))
            ->where('provider_subject', $openId)
            ->value('user_id');

        return is_string($userId) && $userId !== '' ? $this->revokeAll($userId) : 0;
    }

    public function trimSessions(string $userId, int $max): void
    {
        $max = max(1, min(10, $max));

        $active = DB::table('morada_admin_sessions')
            ->where('user_id', $userId)
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
        $request->session()->forget(['admin_jti', 'admin_user_id']);
    }
}
