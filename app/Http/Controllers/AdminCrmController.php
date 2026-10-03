<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AdminRequestContext;
use App\Services\AdminAccessService;
use App\Services\CriticalAuditService;
use App\Services\CrmService;
use App\Support\Clock;
use App\Support\Tokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminCrmController extends Controller
{
    use AdminRequestContext;

    public function __construct(
        private readonly AdminAccessService $access,
        private readonly CrmService $crm,
        private readonly CriticalAuditService $criticalAudit,
    ) {}

    public function panel()
    {
        return response()->file(public_path('admin/index.html'), [
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'X-Robots-Tag' => 'noindex, nofollow',
        ]);
    }

    public function site(): JsonResponse
    {
        return response()->json([
            'site' => $this->crm->getSiteInfo(),
            'testimonials' => $this->crm->listTestimonials(),
        ]);
    }

    public function updateSite(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $site = $this->criticalAudit->run(
            $admin,
            'site.update',
            'site',
            '1',
            fn (): array => $this->crm->saveSiteSettings($request->all()),
        );

        return response()->json(['site' => $site]);
    }

    public function createTestimonial(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $created = $this->criticalAudit->run(
            $admin,
            'testimonial.create',
            'testimonial',
            null,
            fn (): array => $this->crm->addTestimonial($request->all()),
            ['author' => (string) $request->input('author', '')],
        );

        return response()->json(['testimonials' => $created['testimonials']], 201);
    }

    public function removeTestimonial(Request $request, string $id)
    {
        $this->assertId($id);
        $admin = $this->admin($request);
        $this->criticalAudit->run($admin, 'testimonial.remove', 'testimonial', $id, function () use ($id): void {
            if (! $this->crm->removeTestimonial($id)) {
                throw new RuntimeException('NOT_FOUND');
            }
        });

        return response()->noContent();
    }

    public function leads(Request $request): JsonResponse
    {
        $filters = $this->leadFilters($request);
        $paginator = $this->crm->paginateLeads($filters);

        return response()->json([
            'leads' => $paginator->items(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'summary' => [
                'new' => $this->crm->countNewLeads(),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function exportLeads(Request $request): StreamedResponse
    {
        $filters = $this->leadFilters($request, true);
        $format = $filters['format'];
        $count = $this->crm->countExportLeads($filters);

        $this->audit($this->admin($request), 'lead.export', 'lead', null, [
            'format' => $format,
            'filters' => array_intersect_key($filters, array_flip(['status', 'date_from', 'date_to'])),
            'count' => $count,
        ]);

        if ($format === 'json') {
            return response()->stream(function () use ($filters): void {
                echo '{"leads":[';
                $first = true;
                foreach ($this->crm->exportLeadCursor($filters) as $lead) {
                    if (! $first) {
                        echo ',';
                    }
                    echo json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
                    $first = false;
                }
                echo ']}';
            }, 200, [
                'Content-Type' => 'application/json',
                'Cache-Control' => 'no-store',
            ]);
        }

        $columns = ['id', 'name', 'email', 'interest', 'message', 'property_path', 'status', 'created_at', 'updated_at'];

        return response()->streamDownload(function () use ($filters, $columns): void {
            $output = fopen('php://output', 'w');
            if ($output === false) {
                throw new RuntimeException('EXPORT_FAILED');
            }
            echo "\xEF\xBB\xBF";
            fputcsv($output, $columns, ',', '"', '\\', "\r\n");
            foreach ($this->crm->exportLeadCursor($filters) as $lead) {
                fputcsv($output, array_map(fn (string $column): string => $this->csvCell($lead[$column] ?? ''), $columns), ',', '"', '\\', "\r\n");
            }
            fclose($output);
        }, 'leads-'.now()->format('Y-m-d').'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function updateLead(Request $request, string $id): JsonResponse
    {
        $this->assertId($id);
        $status = $request->validate([
            'status' => ['required', 'string', Rule::in(CrmService::LEAD_STATUSES)],
        ])['status'];
        if (! $this->crm->updateLeadStatus($id, $status)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        $this->audit($this->admin($request), 'lead.status', 'lead', $id, ['status' => $status]);

        return response()->json(['ok' => true]);
    }

    private function leadFilters(Request $request, bool $includeFormat = false): array
    {
        $rules = [
            'status' => ['nullable', 'string', Rule::in(CrmService::LEAD_STATUSES)],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
        ];
        if (! $includeFormat) {
            $rules['per_page'] = ['sometimes', 'integer', 'between:20,100'];
            $rules['page'] = ['sometimes', 'integer', 'min:1'];
        } else {
            $rules['format'] = ['sometimes', 'string', Rule::in(['csv', 'json'])];
        }

        $validator = Validator::make($request->query(), $rules);
        $validator->after(static function ($validator): void {
            $data = $validator->getData();
            if (
                is_string($data['date_from'] ?? null)
                && is_string($data['date_to'] ?? null)
                && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $data['date_from'])
                && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $data['date_to'])
                && $data['date_from'] > $data['date_to']
            ) {
                $validator->errors()->add('date_to', 'A data final deve ser igual ou posterior à data inicial.');
            }
        });
        $validated = $validator->validate();

        return [
            'status' => $validated['status'] ?? null,
            'date_from' => $validated['date_from'] ?? null,
            'date_to' => $validated['date_to'] ?? null,
            'per_page' => (int) ($validated['per_page'] ?? 20),
            'page' => (int) ($validated['page'] ?? 1),
            'format' => $validated['format'] ?? 'csv',
        ];
    }

    private function csvCell(mixed $value): string
    {
        $cell = (string) $value;
        if (preg_match('/^[\x00-\x20]*[=+\-@]/u', $cell) === 1) {
            return "'".$cell;
        }

        return $cell;
    }

    public function deleteLead(Request $request, string $id)
    {
        $this->assertId($id);
        if (! $this->crm->deleteLead($id)) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        $this->audit($this->admin($request), 'lead.delete', 'lead', $id, [
            'reason' => 'privacy_or_admin_request',
        ]);

        return response()->noContent();
    }

    public function auditLog(Request $request): JsonResponse
    {
        $raw = $request->query('limit', 100);
        if (! is_numeric($raw)) {
            throw new RuntimeException('INVALID_LIMIT');
        }
        $limit = (int) $raw;
        if ($limit < 1 || $limit > 250) {
            throw new RuntimeException('INVALID_LIMIT');
        }

        return response()->json(['audit' => $this->crm->listAudit($limit)]);
    }

    public function team(Request $request): JsonResponse
    {
        $admin = $this->admin($request);

        return response()->json([
            'team' => array_map(
                fn (array $member): array => $this->crm->staffView($member, $admin, $this->access),
                $this->crm->listStaff()
            ),
        ]);
    }

    public function invitations(): JsonResponse
    {
        return response()->json(['invitations' => $this->crm->listInvitations()]);
    }

    public function createInvitation(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $email = $this->crm->email($request->input('email'), 'INVALID_INVITATION');
        $name = trim((string) $request->input('name', ''));
        $role = (string) $request->input('role', 'editor');

        if ($name === '' || mb_strlen($name) > 255 || ! in_array($role, ['editor', 'manager'], true)) {
            throw new RuntimeException('INVALID_INVITATION');
        }

        $token = Tokens::random(32);
        $expiresAtMs = Clock::nowMs() + CrmService::INVITATION_TTL_MS;
        $this->criticalAudit->run($admin, 'team.invite', 'staff', $email, function () use ($token, $email, $name, $role, $admin, $expiresAtMs): void {
            $this->crm->createInvitation([
                'tokenHash' => hash('sha256', $token),
                'email' => $email,
                'name' => $name,
                'role' => $role,
                'invitedBy' => $admin['email'],
                'expiresAtMs' => $expiresAtMs,
            ]);
        }, [
            'role' => $role,
            'expiresAtMs' => $expiresAtMs,
            'tokenStoredAsHash' => true,
        ]);

        $origin = rtrim((string) config('app.admin_url'), '/');
        if ($origin === '') {
            $origin = rtrim((string) config('app.url'), '/');
        }

        return response()->json([
            'invitation' => [
                'email' => $email,
                'name' => $name,
                'role' => $role,
                'expiresAtMs' => $expiresAtMs,
                'url' => $origin.'/admin?invite='.rawurlencode($token),
            ],
        ], 201);
    }

    public function revokeInvitation(Request $request, string $email)
    {
        $email = $this->crm->email(rawurldecode($email));
        $admin = $this->admin($request);
        $this->criticalAudit->run($admin, 'team.invite.revoke', 'staff', $email, function () use ($email): void {
            if ($this->crm->revokeInvitations($email) < 1) {
                throw new RuntimeException('NOT_FOUND');
            }
        });

        return response()->noContent();
    }

    public function createTeamMember(Request $request): JsonResponse
    {
        $admin = $this->admin($request);
        $email = $this->crm->email($request->input('email'), 'INVALID_TEAM_MEMBER');
        $code = (string) $request->input('pairingCode', '');
        $name = trim((string) $request->input('name', ''));
        $role = (string) $request->input('role', 'editor');

        if (
            ! preg_match('/^[A-Za-z0-9_-]{12,64}$/', $code)
            || $name === '' || mb_strlen($name) > 255
            || ! in_array($role, ['editor', 'manager'], true)
        ) {
            throw new RuntimeException('INVALID_TEAM_MEMBER');
        }

        $member = $this->criticalAudit->run($admin, 'team.create', 'staff', $email, function () use ($code, $email, $name, $role, $admin): array {
            return $this->crm->bindPairing(hash('sha256', $code), $email, $name, $role, $admin['email'])
                ?? throw new RuntimeException('INVALID_PAIRING_CODE');
        }, ['openIdBound' => true]);

        return response()->json([
            'member' => $this->crm->staffView($member, $admin, $this->access),
        ], 201);
    }

    public function updateTeamMember(Request $request, string $email): JsonResponse
    {
        $admin = $this->admin($request);
        $email = $this->crm->email(rawurldecode($email));
        $current = $this->crm->findStaffByEmail($email);
        if (! $current) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $body = $request->all();
        $allowed = ['name', 'role', 'active'];
        if ($body === [] || array_diff(array_keys($body), $allowed)) {
            throw new RuntimeException('INVALID_TEAM_MEMBER');
        }

        $patch = [];
        if (array_key_exists('name', $body)) {
            $name = trim((string) $body['name']);
            if ($name === '' || mb_strlen($name) > 255) {
                throw new RuntimeException('INVALID_TEAM_MEMBER');
            }
            $patch['name'] = $name;
        }
        if (array_key_exists('role', $body)) {
            if (! in_array($body['role'], ['editor', 'manager'], true)) {
                throw new RuntimeException('INVALID_TEAM_MEMBER');
            }
            $patch['role'] = $body['role'];
        }
        if (array_key_exists('active', $body)) {
            if (! is_bool($body['active']) && ! in_array($body['active'], [0, 1, '0', '1', 'true', 'false'], true)) {
                throw new RuntimeException('INVALID_TEAM_MEMBER');
            }
            $patch['active'] = filter_var($body['active'], FILTER_VALIDATE_BOOL);
        }

        $targetOpenId = (string) ($current['open_id'] ?? '');
        $isSelf = $targetOpenId !== '' && hash_equals($targetOpenId, $admin['openId']);
        $isBootstrap = $this->access->isBootstrap($targetOpenId);

        if ($isSelf && (
            (isset($patch['role']) && $patch['role'] !== $admin['role'])
            || (array_key_exists('active', $patch) && $patch['active'] === false)
        )) {
            return response()->json(['error' => 'CANNOT_CHANGE_SELF_ACCESS'], 400);
        }

        if ($isBootstrap && (
            (isset($patch['role']) && $patch['role'] !== 'manager')
            || (array_key_exists('active', $patch) && $patch['active'] === false)
        )) {
            return response()->json(['error' => 'BOOTSTRAP_MANAGER_PROTECTED'], 400);
        }

        $member = $this->criticalAudit->run($admin, 'team.update', 'staff', $email, function () use ($email, $targetOpenId, $patch, $current, $isBootstrap, $admin): array {
            $member = $this->crm->saveStaff([
                'email' => $email,
                'openId' => $targetOpenId,
                'name' => $patch['name'] ?? $current['name'],
                'role' => $isBootstrap ? 'manager' : ($patch['role'] ?? $current['role']),
                'active' => $patch['active'] ?? (bool) $current['active'],
                'invitedBy' => $current['invited_by'] ?: $admin['email'],
            ]);
            if ($targetOpenId !== '') {
                $this->access->revokeAllForOpenId($targetOpenId);
            }

            return $member;
        }, ['sessionsRevoked' => true]);

        return response()->json([
            'member' => $this->crm->staffView($member, $admin, $this->access),
        ]);
    }

    public function removeTeamMember(Request $request, string $email)
    {
        $admin = $this->admin($request);
        $email = $this->crm->email(rawurldecode($email));
        $current = $this->crm->findStaffByEmail($email);
        if (! $current) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $openId = (string) ($current['open_id'] ?? '');
        if ($openId !== '' && hash_equals($openId, $admin['openId'])) {
            return response()->json(['error' => 'CANNOT_REMOVE_SELF'], 400);
        }
        if ($this->access->isBootstrap($openId)) {
            return response()->json(['error' => 'BOOTSTRAP_MANAGER_PROTECTED'], 400);
        }

        $this->criticalAudit->run($admin, 'team.remove', 'staff', $email, function () use ($email, $openId): void {
            if (! $this->crm->removeStaff($email)) {
                throw new RuntimeException('NOT_FOUND');
            }
            if ($openId !== '') {
                $this->access->revokeAllForOpenId($openId);
            }
        }, ['sessionsRevoked' => true]);

        return response()->noContent();
    }
}
