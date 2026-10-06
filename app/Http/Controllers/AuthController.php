<?php

namespace App\Http\Controllers;

use App\Services\AdminAccessService;
use App\Services\CriticalAuditService;
use App\Services\CrmService;
use App\Support\Clock;
use App\Support\Tokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function __construct(
        private readonly AdminAccessService $access,
        private readonly CrmService $crm,
        private readonly CriticalAuditService $criticalAudit,
    ) {}

    public function login(Request $request): RedirectResponse|Response
    {
        $oauth = config('services.google_oauth');
        if (empty($oauth['client_id']) || empty($oauth['client_secret'])) {
            return response('Autenticação administrativa não configurada.', 503);
        }

        $invitationHash = null;
        $invite = $request->query('invite');
        if ($invite !== null) {
            if (! is_string($invite) || ! preg_match('/^[A-Za-z0-9_-]{43}$/', $invite)) {
                return response('Convite inválido ou expirado.', 400);
            }
            $invitationHash = hash('sha256', $invite);
            $invitation = $this->crm->findInvitation($invitationHash);
            $now = Clock::nowMs();
            if (
                ! $invitation || $invitation['accepted_at'] || $invitation['revoked_at']
                || (int) $invitation['expires_at_ms'] <= $now
            ) {
                return response('Convite inválido ou expirado.', 400);
            }
        }

        $origin = $this->adminOrigin($request);
        $redirectUri = $origin.'/api/auth/callback';
        $state = Tokens::random(32);
        $this->crm->createAuthChallenge(
            hash('sha256', $state),
            $redirectUri,
            Clock::nowMs() + CrmService::OAUTH_STATE_TTL_MS,
            $invitationHash
        );
        $request->session()->put('oauth_state', $state);

        $url = (string) $oauth['authorization_url'].'?'.http_build_query([
            'client_id' => $oauth['client_id'],
            'state' => $state,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'access_type' => 'online',
            'prompt' => 'select_account',
        ]);

        return redirect()->away($url, 302)
            ->header('Cache-Control', 'no-store')
            ->header('Referrer-Policy', 'no-referrer');
    }

    public function callback(Request $request): RedirectResponse|Response
    {
        $code = (string) $request->query('code', '');
        $state = (string) $request->query('state', '');
        $savedState = (string) $request->session()->pull('oauth_state', '');

        if (
            $code === '' || strlen($code) > 4096
            || ! preg_match('/^[A-Za-z0-9._~+\/=\-]+$/', $code)
            || ! preg_match('/^[A-Za-z0-9_-]{43}$/', $state)
            || ! preg_match('/^[A-Za-z0-9_-]{43}$/', $savedState)
            || ! hash_equals($savedState, $state)
        ) {
            return response('Sessão de autenticação inválida. Tente novamente.', 400);
        }

        $challenge = $this->crm->consumeAuthChallenge(hash('sha256', $state));
        if (! $challenge) {
            return response('Sessão de autenticação expirada ou já utilizada.', 400);
        }

        $origin = $this->adminOrigin($request);
        $redirectUri = $origin.'/api/auth/callback';
        if (! hash_equals($redirectUri, (string) $challenge['redirect_uri'])) {
            return response('Origem de autenticação inválida.', 400);
        }

        try {
            $identity = $this->exchangeCode($code, $redirectUri);
        } catch (RuntimeException $error) {
            if ($error->getMessage() === 'EMAIL_NOT_VERIFIED') {
                return response('O provedor não confirmou o e-mail verificado.', 403);
            }

            report($error);

            return response('Não foi possível concluir o acesso. Tente novamente.', 400);
        } catch (\Throwable $error) {
            report($error);

            return response('Não foi possível concluir o acesso. Tente novamente.', 400);
        }

        $staff = null;
        if (! empty($challenge['invitation_hash'])) {
            try {
                $staff = $this->crm->acceptInvitation(
                    (string) $challenge['invitation_hash'],
                    $identity['openId'],
                    $identity['email']
                );
            } catch (RuntimeException $error) {
                return match ($error->getMessage()) {
                    'INVITATION_EMAIL_MISMATCH' => response('Este convite foi destinado a outro e-mail.', 403),
                    'TEAM_MEMBER_EXISTS' => response('Este e-mail ou identidade já possui um acesso administrativo.', 409),
                    default => throw $error,
                };
            }
            if (! $staff) {
                return response('Este convite expirou, foi revogado ou já foi utilizado.', 403);
            }
        } else {
            $staff = $this->crm->findStaffByOpenId($identity['openId']);
        }

        $bootstrap = $this->access->isBootstrapIdentity($identity['openId'], $identity['email']);
        if (! $bootstrap && ! $this->validStaffAccess($staff, $identity)) {
            $pairingCode = Tokens::random(12);
            $this->crm->createPairing(
                hash('sha256', $pairingCode),
                $identity['openId'],
                $identity['email'],
                Clock::nowMs() + CrmService::PAIRING_TTL_MS
            );

            return response(
                "Acesso administrativo ainda não liberado.\n\n".
                "Código de vinculação temporário: {$pairingCode}\n\n".
                'Validade: 15 minutos. Envie este código ao gestor para concluir o vínculo.',
                403,
                ['Content-Type' => 'text/plain; charset=utf-8']
            );
        }

        $role = $bootstrap ? 'manager' : (($staff['role'] ?? 'editor') === 'manager' ? 'manager' : 'editor');

        if ($bootstrap) {
            $this->crm->saveStaff([
                'email' => $identity['email'],
                'openId' => $identity['openId'],
                'name' => $identity['name'],
                'role' => 'manager',
                'active' => true,
                'invitedBy' => 'environment',
            ]);
        }

        try {
            $admin = $this->access->establish($request, $identity + [
                'provider' => (string) config('services.google_oauth.provider', 'google'),
                'providerSubject' => $identity['openId'],
            ], $role);
            $this->auditAuthentication($admin, 'auth.login');
        } catch (\Throwable $error) {
            try {
                $this->access->revokeCurrent($request);
            } catch (\Throwable $revokeError) {
                report($revokeError);
            }
            report($error);

            return response('Não foi possível concluir o acesso. Tente novamente.', 503);
        }

        return redirect()->to($origin.'/admin', 303);
    }

    public function session(Request $request): JsonResponse
    {
        $user = $this->access->current($request);
        if (! $user) {
            $this->access->clearBrowserSession($request);
        }

        return response()->json([
            'authenticated' => (bool) $user,
            'user' => $user ? [
                'email' => $user['email'],
                'name' => $user['name'],
                'role' => $user['role'],
            ] : null,
            'csrfToken' => csrf_token(),
        ])->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache');
    }

    public function logout(Request $request): JsonResponse
    {
        $admin = $this->access->current($request);
        try {
            $this->access->revokeCurrent($request);
            if ($admin) {
                $this->auditAuthentication($admin, 'auth.logout');
            }
        } catch (\Throwable $error) {
            report($error);

            return response()->json([
                'ok' => false,
                'localLoggedOut' => true,
                'error' => 'AUDIT_UNAVAILABLE',
            ], 503);
        }

        return response()->json(['ok' => true]);
    }

    public function logoutAll(Request $request): JsonResponse
    {
        $admin = $this->access->current($request);
        if (! $admin) {
            $this->access->clearBrowserSession($request);

            return response()->json(['error' => 'AUTH_REQUIRED', 'localLoggedOut' => true], 401);
        }

        $this->criticalAudit->run(
            $admin,
            'auth.logout_all',
            'admin_user',
            (string) $admin['userId'],
            fn (): int => $this->access->revokeAll($admin['userId']),
        );
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    private function exchangeCode(string $code, string $redirectUri): array
    {
        $oauth = config('services.google_oauth');

        $tokenResponse = Http::asForm()
            ->acceptJson()
            ->timeout(10)
            ->post((string) $oauth['token_url'], [
                'client_id' => $oauth['client_id'],
                'client_secret' => $oauth['client_secret'],
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => $redirectUri,
            ]);

        if (! $tokenResponse->successful()) {
            throw new RuntimeException('OAUTH_TOKEN_EXCHANGE_FAILED');
        }

        $token = $tokenResponse->json();
        if (! is_array($token)) {
            throw new RuntimeException('OAUTH_TOKEN_RESPONSE_INVALID');
        }

        $accessToken = (string) ($token['access_token'] ?? '');
        if ($accessToken === '') {
            throw new RuntimeException('OAUTH_ACCESS_TOKEN_MISSING');
        }

        $identityResponse = Http::withToken($accessToken)
            ->acceptJson()
            ->timeout(10)
            ->get((string) $oauth['userinfo_url']);

        if (! $identityResponse->successful()) {
            throw new RuntimeException('OAUTH_USERINFO_FAILED');
        }

        $info = $identityResponse->json();

        $email = strtolower(trim((string) ($info['email'] ?? '')));
        $openId = trim((string) ($info['sub'] ?? ''));
        $name = trim((string) ($info['name'] ?? ($email ?: 'Administrador')));
        $verified = $info['email_verified'] ?? null;

        if ($verified !== true) {
            throw new RuntimeException('EMAIL_NOT_VERIFIED');
        }

        if (
            ! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255
            || $openId === '' || strlen($openId) > 191
            || preg_match('/\s/', $openId) || preg_match('/[\x00-\x1f\x7f]/', $openId)
        ) {
            throw new RuntimeException('INVALID_IDENTITY');
        }

        return ['email' => $email, 'openId' => $openId, 'name' => mb_substr($name, 0, 255)];
    }

    private function validStaffAccess(?array $staff, array $identity): bool
    {
        if (! $staff || ! (bool) ($staff['active'] ?? false)) {
            return false;
        }
        $bound = (string) ($staff['open_id'] ?? '');

        // Depois que o gestor vinculou o subject imutável, uma troca de email
        // confirmada pelo provedor atualiza o perfil mas não perde a conta.
        // Antes do vínculo, email continua sendo a prova do convite/pairing.
        return $bound !== ''
            ? hash_equals($bound, $identity['openId'])
            : strtolower((string) ($staff['email'] ?? '')) === strtolower($identity['email']);
    }

    /**
     * A autenticação só é considerada concluída quando a trilha também foi
     * persistida. O chamador revoga a sessão em caso de falha.
     *
     * @param  array<string, mixed>  $admin
     * @param  array<string, mixed>|null  $details
     */
    private function auditAuthentication(array $admin, string $action, ?array $details = null): void
    {
        $this->crm->recordAudit($admin, $action, 'admin_user', (string) $admin['openId'], $details);
    }

    private function adminOrigin(Request $request): string
    {
        $origin = rtrim((string) config('app.admin_url'), '/');

        return $origin !== '' ? $origin : $request->getSchemeAndHttpHost();
    }
}
