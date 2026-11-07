<?php

namespace App\Console\Commands;

use App\Mail\OperationsNotice;
use App\Support\Clock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class MonitorSecurityOperations extends Command
{
    protected $signature = 'gisley:security-monitor {--fail-on-alert : Return a nonzero exit code if a threshold is exceeded}';

    protected $description = 'Check administrative security signals without displaying personal information';

    public function handle(): int
    {
        $actions = [
            'auth.login', 'lead.export', 'lead.delete', 'property.archive',
            'team.remove', 'form.delete', 'testimonial.delete', 'team.create',
            'team.update', 'team.invite', 'team.invite.revoke',
        ];

        $counts = DB::table('morada_audit_log')
            ->selectRaw('action, COUNT(*) as total')
            ->where('created_at', '>=', now()->subHour())
            ->whereIn('action', $actions)
            ->groupBy('action')
            ->pluck('total', 'action');

        $count = static fn (string $action): int => (int) ($counts[$action] ?? 0);
        $metrics = [
            'logins_per_hour' => $count('auth.login'),
            'exports_per_hour' => $count('lead.export'),
            'destructive_per_hour' => array_sum(array_map($count, [
                'lead.delete', 'property.archive', 'team.remove', 'form.delete', 'testimonial.delete',
            ])),
            'team_changes_per_hour' => array_sum(array_map($count, [
                'team.create', 'team.update', 'team.invite', 'team.invite.revoke',
            ])),
            'inactive_staff_sessions' => DB::table('morada_admin_sessions as session')
                ->join('morada_staff_access as staff', 'staff.open_id', '=', 'session.open_id')
                ->where('staff.active', false)
                ->whereNull('session.revoked_at')
                ->where('session.expires_at_ms', '>', Clock::nowMs())
                ->count(),
            'invalid_staff_roles' => DB::table('morada_staff_access')
                ->whereNotIn('role', ['manager', 'editor'])
                ->count(),
        ];

        $configured = config('gisley.security.monitor', []);
        $alerts = 0;
        $alertMetrics = [];
        foreach ($metrics as $metric => $value) {
            $limit = in_array($metric, ['inactive_staff_sessions', 'invalid_staff_roles'], true)
                ? 0
                : max(1, (int) ($configured[$metric] ?? 1));
            $exceeded = $value > $limit;
            $this->line(sprintf('[%s] %s=%d threshold=%d', $exceeded ? 'ALERT' : 'OK', $metric, $value, $limit));

            if ($exceeded) {
                $alerts++;
                $alertMetrics[] = sprintf('%s=%d (limite=%d)', $metric, $value, $limit);
                // Aggregate counts only: never log client data, session IDs or emails.
                Log::warning('security.monitor.threshold_exceeded', [
                    'metric' => $metric,
                    'observed' => $value,
                    'threshold' => $limit,
                ]);
            }
        }

        $this->line(sprintf('Security monitor: %d alert(s) in the current check.', $alerts));

        if ($alerts > 0) {
            $this->notifyByEmail($alertMetrics);
        }

        return $alerts > 0 && $this->option('fail-on-alert') ? self::FAILURE : self::SUCCESS;
    }

    /** @param list<string> $metrics */
    private function notifyByEmail(array $metrics): void
    {
        $recipient = (string) config('gisley.security.alert_email', '');
        if (! filter_var($recipient, FILTER_VALIDATE_EMAIL) || config('mail.default') !== 'smtp') {
            return;
        }

        $key = 'gisley-security-monitor:'.now()->format('Y-m-d-H');
        if (! Cache::add($key, 1, now()->addHours(2))) {
            return;
        }

        try {
            Mail::to($recipient)->send(new OperationsNotice(
                'Gisley Nunes — alerta operacional',
                "O monitor de segurança detectou indicadores acima do limite:\n".implode("\n", $metrics)."\nVerifique os logs protegidos do servidor.",
            ));
        } catch (\Throwable $error) {
            Cache::forget($key);
            Log::error('security.monitor.email_failed', ['exception' => $error::class]);
            $this->warn('Could not deliver security monitor email.');
        }
    }
}
