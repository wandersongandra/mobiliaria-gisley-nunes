<?php

namespace App\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class CrmService
{
    public const LEAD_STATUSES = ['new', 'em_contato', 'fechado', 'perdido'];

    public const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

    public const PAIRING_TTL_MS = 15 * 60 * 1000;

    public const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

    private const DEFAULT_SITE = [
        'name' => 'Gisley Nunes Imóveis',
        'crci' => '',
        'area' => 'Belo Horizonte e região',
        'address' => 'Belo Horizonte, MG',
        'phoneDisplay' => '(31) 9155-4677',
        'whatsapp' => '553191554677',
        'email' => 'Gisleynunesimoveis@gmail.com',
        'instagramDisplay' => '',
        'instagramUrl' => '',
    ];

    public function getSiteInfo(): array
    {
        $row = DB::table('morada_site_settings')->where('id', 1)->first();
        if (! $row) {
            return self::DEFAULT_SITE;
        }

        return array_merge(self::DEFAULT_SITE, array_filter([
            'phoneDisplay' => $row->phone_display,
            'whatsapp' => $row->whatsapp,
            'email' => $row->email,
            'address' => $row->address,
            'crci' => $row->crci,
            'area' => $row->area,
            'instagramUrl' => $row->instagram_url,
            'instagramDisplay' => $row->instagram_display,
        ], static fn ($value) => $value !== null));
    }

    public function saveSiteSettings(array $input): array
    {
        $allowed = ['phoneDisplay', 'whatsapp', 'email', 'address', 'crci', 'area', 'instagramUrl', 'instagramDisplay'];
        if (array_diff(array_keys($input), $allowed)) {
            throw new RuntimeException('INVALID_SITE_SETTINGS');
        }

        $email = $this->email($input['email'] ?? '');
        $rawWhatsapp = $this->text($input['whatsapp'] ?? '', 40, true, 'INVALID_SITE_SETTINGS');
        if (! preg_match('/^[0-9\s()+.\-]+$/', $rawWhatsapp)) {
            throw new RuntimeException('INVALID_SITE_SETTINGS');
        }
        $whatsapp = preg_replace('/\D+/', '', $rawWhatsapp) ?: '';
        if (strlen($whatsapp) < 10 || strlen($whatsapp) > 15) {
            throw new RuntimeException('INVALID_SITE_SETTINGS');
        }

        $instagramUrl = $this->text($input['instagramUrl'] ?? '', 200, false, 'INVALID_SITE_SETTINGS');
        if ($instagramUrl !== '') {
            $parts = parse_url($instagramUrl);
            $host = strtolower((string) ($parts['host'] ?? ''));
            if (($parts['scheme'] ?? '') !== 'https' || ! preg_match('/(^|\.)instagram\.com$/i', $host)) {
                throw new RuntimeException('INVALID_SITE_SETTINGS');
            }
        }

        DB::table('morada_site_settings')->updateOrInsert(
            ['id' => 1],
            [
                'phone_display' => $this->text($input['phoneDisplay'] ?? '', 50, false, 'INVALID_SITE_SETTINGS'),
                'whatsapp' => $whatsapp,
                'email' => $email,
                'address' => $this->text($input['address'] ?? '', 180, false, 'INVALID_SITE_SETTINGS'),
                'crci' => $this->text($input['crci'] ?? '', 30, false, 'INVALID_SITE_SETTINGS'),
                'area' => $this->text($input['area'] ?? '', 120, true, 'INVALID_SITE_SETTINGS'),
                'instagram_url' => $instagramUrl,
                'instagram_display' => $this->text($input['instagramDisplay'] ?? '', 60, false, 'INVALID_SITE_SETTINGS'),
                'updated_at' => now(),
            ]
        );

        return $this->getSiteInfo();
    }

    public function listTestimonials(): array
    {
        return DB::table('morada_testimonials')
            ->orderBy('sort_order')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($row) => [
                'id' => (string) $row->id,
                'author' => (string) $row->author,
                'quote' => (string) $row->quote,
                'location' => (string) ($row->location ?? ''),
                'year' => (string) ($row->year ?? ''),
            ])
            ->all();
    }

    public function addTestimonial(array $input): array
    {
        $allowed = ['author', 'quote', 'location', 'year', 'sortOrder'];
        if (array_diff(array_keys($input), $allowed)) {
            throw new RuntimeException('INVALID_TESTIMONIAL');
        }

        $year = $this->text($input['year'] ?? '', 10, false, 'INVALID_TESTIMONIAL');
        if ($year !== '' && ! preg_match('/^(19|20|21)\d{2}$/', $year)) {
            throw new RuntimeException('INVALID_TESTIMONIAL');
        }

        $id = (string) Str::uuid();
        DB::table('morada_testimonials')->insert([
            'id' => $id,
            'author' => $this->text($input['author'] ?? '', 120, true, 'INVALID_TESTIMONIAL'),
            'quote' => $this->text($input['quote'] ?? '', 1200, true, 'INVALID_TESTIMONIAL'),
            'location' => $this->text($input['location'] ?? '', 120, false, 'INVALID_TESTIMONIAL'),
            'year' => $year,
            'sort_order' => max(0, min(10000, (int) ($input['sortOrder'] ?? 0))),
            'created_at' => now(),
        ]);

        return ['id' => $id, 'testimonials' => $this->listTestimonials()];
    }

    public function removeTestimonial(string $id): bool
    {
        return DB::table('morada_testimonials')->where('id', $id)->delete() > 0;
    }

    public function createContactLead(array $input): string
    {
        $allowed = ['name', 'email', 'message', 'interest', 'propertyPath', 'website'];
        if (array_diff(array_keys($input), $allowed)) {
            throw new RuntimeException('INVALID_CONTACT');
        }

        $interests = [
            'Quero comprar um imóvel',
            'Quero alugar um imóvel',
            'Quero anunciar meu imóvel',
            'Tenho outra dúvida',
        ];

        $interest = (string) ($input['interest'] ?? 'Tenho outra dúvida');
        if (! in_array($interest, $interests, true)) {
            throw new RuntimeException('INVALID_CONTACT');
        }

        $propertyPath = $this->text($input['propertyPath'] ?? '', 240, false, 'INVALID_CONTACT');
        if ($propertyPath !== '' && ! preg_match('#^/(?:|contato|imoveis(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?)$#', $propertyPath)) {
            throw new RuntimeException('INVALID_CONTACT');
        }

        $id = (string) Str::uuid();
        DB::table('morada_contact_leads')->insert([
            'id' => $id,
            'name' => $this->text($input['name'] ?? '', 120, true, 'INVALID_CONTACT'),
            'email' => $this->email($input['email'] ?? '', 'INVALID_CONTACT'),
            'interest' => $interest,
            'message' => $this->text($input['message'] ?? '', 3000, true, 'INVALID_CONTACT'),
            'property_path' => $propertyPath !== '' ? $propertyPath : null,
            'status' => 'new',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function paginateLeads(array $filters): LengthAwarePaginator
    {
        $paginator = $this->leadQuery($filters)->paginate(
            $filters['per_page'],
            ['*'],
            'page',
            $filters['page']
        );

        $paginator->getCollection()->transform(fn ($row): array => $this->leadView((array) $row));

        return $paginator;
    }

    public function countNewLeads(): int
    {
        return DB::table('morada_contact_leads')->where('status', 'new')->count();
    }

    public function exportLeads(array $filters): array
    {
        return $this->leadQuery($filters)
            ->get()
            ->map(fn ($row): array => $this->leadView((array) $row))
            ->all();
    }

    public function updateLeadStatus(string $id, string $status): bool
    {
        if (! in_array($status, self::LEAD_STATUSES, true)) {
            throw new RuntimeException('INVALID_LEAD_STATUS');
        }

        return DB::table('morada_contact_leads')
            ->where('id', $id)
            ->update(['status' => $status, 'updated_at' => now()]) > 0;
    }

    public function anonymizeExpiredLeads(): int
    {
        $cutoff = now()->subYears(2);
        $anonymized = 0;

        DB::table('morada_contact_leads')
            ->select(['id', 'status', 'updated_at'])
            ->whereIn('status', ['fechado', 'closed', 'perdido', 'lost'])
            ->where('updated_at', '<', $cutoff)
            ->orderBy('id')
            ->chunkById(100, function ($leads) use (&$anonymized): void {
                foreach ($leads as $lead) {
                    $id = (string) $lead->id;
                    $anonymized += DB::table('morada_contact_leads')
                        ->where('id', $id)
                        ->whereIn('status', ['fechado', 'closed', 'perdido', 'lost'])
                        ->where('updated_at', $lead->updated_at)
                        ->update([
                            'name' => 'Contato anonimizado',
                            'email' => 'anonimizado+'.$id.'@invalid.local',
                            'message' => 'Dados pessoais removidos conforme política de retenção.',
                            'property_path' => null,
                        ]);
                }
            });

        return $anonymized;
    }

    private function leadQuery(array $filters): Builder
    {
        $query = DB::table('morada_contact_leads');

        if (isset($filters['status'])) {
            $legacyStatuses = match ($filters['status']) {
                'em_contato' => ['em_contato', 'contacted', 'qualified'],
                'fechado' => ['fechado', 'closed'],
                'perdido' => ['perdido', 'lost'],
                default => [$filters['status']],
            };
            $query->whereIn('status', $legacyStatuses);
        }

        if (isset($filters['date_from'])) {
            $query->where('created_at', '>=', $filters['date_from'].' 00:00:00');
        }

        if (isset($filters['date_to'])) {
            $query->where('created_at', '<', Carbon::parse($filters['date_to'])->addDay()->toDateString().' 00:00:00');
        }

        return $query->orderByDesc('created_at')->orderByDesc('id');
    }

    private function leadView(array $lead): array
    {
        $lead['status'] = match ($lead['status']) {
            'contacted', 'qualified' => 'em_contato',
            'closed' => 'fechado',
            'lost' => 'perdido',
            default => $lead['status'],
        };

        return $lead;
    }

    public function deleteLead(string $id): bool
    {
        return DB::table('morada_contact_leads')->where('id', $id)->delete() > 0;
    }

    public function recordAudit(array $admin, string $action, string $entityType, ?string $entityId = null, ?array $details = null): void
    {
        DB::table('morada_audit_log')->insert([
            'id' => (string) Str::uuid(),
            'actor_email' => $admin['email'] ?? 'system',
            'actor_open_id' => $admin['openId'] ?? null,
            'action' => substr($action, 0, 80),
            'entity_type' => substr($entityType, 0, 60),
            'entity_id' => $entityId ? substr($entityId, 0, 191) : null,
            'details' => $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'created_at' => now(),
        ]);
    }

    public function listAudit(int $limit = 100): array
    {
        $limit = max(1, min(250, $limit));

        return DB::table('morada_audit_log')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'actor_email', 'action', 'entity_type', 'entity_id', 'created_at'])
            ->map(fn ($row) => (array) $row)
            ->all();
    }

    public function findStaffByEmail(string $email): ?array
    {
        $row = DB::table('morada_staff_access')->where('email', strtolower($email))->first();

        return $row ? (array) $row : null;
    }

    public function findStaffByOpenId(string $openId): ?array
    {
        $row = DB::table('morada_staff_access')->where('open_id', $openId)->first();

        return $row ? (array) $row : null;
    }

    public function listStaff(): array
    {
        return DB::table('morada_staff_access')
            ->orderByDesc('active')
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => (array) $row)
            ->all();
    }

    public function saveStaff(array $data): array
    {
        $email = $this->email($data['email'] ?? '', 'INVALID_TEAM_MEMBER');
        $role = ($data['role'] ?? 'editor') === 'manager' ? 'manager' : 'editor';

        try {
            DB::table('morada_staff_access')->updateOrInsert(
                ['email' => $email],
                [
                    'open_id' => $data['openId'] ?: null,
                    'name' => $this->text($data['name'] ?? '', 255, true, 'INVALID_TEAM_MEMBER'),
                    'role' => $role,
                    'active' => (bool) ($data['active'] ?? true),
                    'invited_by' => $data['invitedBy'] ?? null,
                    'updated_at' => now(),
                ]
            );
        } catch (QueryException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new RuntimeException('TEAM_MEMBER_EXISTS', previous: $e);
            }
            throw $e;
        }

        return $this->findStaffByEmail($email) ?? throw new RuntimeException('NOT_FOUND');
    }

    public function removeStaff(string $email): bool
    {
        return DB::table('morada_staff_access')->where('email', strtolower($email))->delete() > 0;
    }

    public function createInvitation(array $data): void
    {
        $email = $this->email($data['email'] ?? '', 'INVALID_INVITATION');

        DB::table('morada_staff_invitations')
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        DB::table('morada_staff_invitations')->insert([
            'token_hash' => $data['tokenHash'],
            'email' => $email,
            'name' => $this->text($data['name'] ?? '', 255, true, 'INVALID_INVITATION'),
            'role' => ($data['role'] ?? 'editor') === 'manager' ? 'manager' : 'editor',
            'invited_by' => $data['invitedBy'],
            'expires_at_ms' => $data['expiresAtMs'],
            'created_at' => now(),
        ]);
    }

    public function listInvitations(): array
    {
        $now = (int) floor(microtime(true) * 1000);

        return DB::table('morada_staff_invitations')
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->where('expires_at_ms', '>', $now)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($row) => [
                'email' => (string) $row->email,
                'name' => (string) $row->name,
                'role' => (string) $row->role,
                'invited_by' => (string) $row->invited_by,
                'expires_at_ms' => (int) $row->expires_at_ms,
                'created_at' => $row->created_at,
            ])
            ->all();
    }

    public function findInvitation(string $tokenHash): ?array
    {
        $row = DB::table('morada_staff_invitations')->where('token_hash', $tokenHash)->first();

        return $row ? (array) $row : null;
    }

    public function acceptInvitation(string $tokenHash, string $openId, string $email): ?array
    {
        $email = strtolower($email);
        $nowMs = (int) floor(microtime(true) * 1000);

        return DB::transaction(function () use ($tokenHash, $openId, $email, $nowMs): ?array {
            $invitation = DB::table('morada_staff_invitations')
                ->where('token_hash', $tokenHash)
                ->lockForUpdate()
                ->first();

            if (! $invitation
                || $invitation->accepted_at
                || $invitation->revoked_at
                || (int) $invitation->expires_at_ms <= $nowMs) {
                return null;
            }

            if (strtolower((string) $invitation->email) !== $email) {
                throw new RuntimeException('INVITATION_EMAIL_MISMATCH');
            }

            if (DB::table('morada_staff_access')
                ->where(function ($query) use ($email, $openId): void {
                    $query->where('email', $email)->orWhere('open_id', $openId);
                })
                ->exists()) {
                throw new RuntimeException('TEAM_MEMBER_EXISTS');
            }

            DB::table('morada_staff_access')->insert([
                'email' => $email,
                'open_id' => $openId,
                'name' => $invitation->name,
                'role' => $invitation->role === 'manager' ? 'manager' : 'editor',
                'active' => 1,
                'invited_by' => $invitation->invited_by,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('morada_staff_invitations')
                ->where('token_hash', $tokenHash)
                ->update(['accepted_at' => now()]);

            return $this->findStaffByEmail($email);
        });
    }

    public function revokeInvitations(string $email): int
    {
        return DB::table('morada_staff_invitations')
            ->where('email', strtolower($email))
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function createPairing(string $codeHash, string $openId, string $email, int $expiresAtMs): void
    {
        DB::transaction(function () use ($codeHash, $openId, $email, $expiresAtMs): void {
            DB::table('morada_identity_pairings')
                ->where('open_id', $openId)
                ->orWhere('email', strtolower($email))
                ->delete();

            DB::table('morada_identity_pairings')->insert([
                'code_hash' => $codeHash,
                'open_id' => $openId,
                'email' => strtolower($email),
                'expires_at_ms' => $expiresAtMs,
                'created_at' => now(),
            ]);
        });
    }

    public function bindPairing(string $codeHash, string $email, string $name, string $role, string $invitedBy): ?array
    {
        $email = $this->email($email, 'INVALID_TEAM_MEMBER');
        $nowMs = (int) floor(microtime(true) * 1000);

        return DB::transaction(function () use ($codeHash, $email, $name, $role, $invitedBy, $nowMs): ?array {
            $pairing = DB::table('morada_identity_pairings')
                ->where('code_hash', $codeHash)
                ->lockForUpdate()
                ->first();

            if (! $pairing || (int) $pairing->expires_at_ms <= $nowMs || strtolower((string) $pairing->email) !== $email) {
                return null;
            }

            $member = $this->saveStaff([
                'email' => $email,
                'openId' => $pairing->open_id,
                'name' => $name,
                'role' => $role,
                'active' => true,
                'invitedBy' => $invitedBy,
            ]);

            DB::table('morada_identity_pairings')->where('code_hash', $codeHash)->delete();

            return $member;
        });
    }

    public function createAuthChallenge(string $stateHash, string $redirectUri, int $expiresAtMs, ?string $invitationHash): void
    {
        DB::table('morada_auth_challenges')->insert([
            'state_hash' => $stateHash,
            'redirect_uri' => $redirectUri,
            'invitation_hash' => $invitationHash,
            'expires_at_ms' => $expiresAtMs,
            'created_at' => now(),
        ]);
    }

    public function consumeAuthChallenge(string $stateHash): ?array
    {
        $nowMs = (int) floor(microtime(true) * 1000);

        return DB::transaction(function () use ($stateHash, $nowMs): ?array {
            $row = DB::table('morada_auth_challenges')
                ->where('state_hash', $stateHash)
                ->lockForUpdate()
                ->first();

            if (! $row) {
                return null;
            }

            DB::table('morada_auth_challenges')->where('state_hash', $stateHash)->delete();

            if ((int) $row->expires_at_ms <= $nowMs) {
                return null;
            }

            return (array) $row;
        });
    }

    public function staffView(array $member, array $actor, AdminAccessService $access): array
    {
        $openId = (string) ($member['open_id'] ?? '');

        return [
            'email' => (string) ($member['email'] ?? ''),
            'name' => (string) ($member['name'] ?? ''),
            'role' => ($member['role'] ?? '') === 'manager' ? 'manager' : 'editor',
            'active' => (bool) ($member['active'] ?? false),
            'is_self' => $openId !== '' && $openId === (string) ($actor['openId'] ?? ''),
            'is_bootstrap' => $access->isBootstrap($openId),
        ];
    }

    private function text(mixed $value, int $max, bool $required, string $error): string
    {
        $value = trim((string) $value);
        if (($required && $value === '') || mb_strlen($value) > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $value)) {
            throw new RuntimeException($error);
        }

        return $value;
    }

    public function email(mixed $value, string $error = 'INVALID_EMAIL'): string
    {
        $email = strtolower(trim((string) $value));
        if (strlen($email) > 255 || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException($error);
        }

        return $email;
    }
}
