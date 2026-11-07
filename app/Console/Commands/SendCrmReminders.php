<?php

namespace App\Console\Commands;

use App\Mail\OperationsNotice;
use App\Services\PanelNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendCrmReminders extends Command
{
    protected $signature = 'gisley:crm-reminders';

    protected $description = 'Queue daily in-panel follow-up reminders and optional aggregate email';

    public function handle(PanelNotificationService $notifications): int
    {
        $created = $notifications->queueDueReminders();
        $this->info(sprintf('Queued %d follow-up notification(s).', $created));

        $recipient = (string) config('gisley.crm.alert_email', '');
        $pending = DB::table('morada_contact_leads')
            ->whereNotNull('follow_up_date')
            ->where('follow_up_date', '<=', now()->toDateString())
            ->whereNotIn('status', ['fechado', 'perdido', 'closed', 'lost'])
            ->exists();
        if (! $pending || ! filter_var($recipient, FILTER_VALIDATE_EMAIL)
            || config('mail.default') !== 'smtp') {
            return self::SUCCESS;
        }

        $key = 'gisley-crm-reminder-mail:'.now()->toDateString();
        if (! Cache::add($key, 1, now()->addDays(2))) {
            return self::SUCCESS;
        }

        try {
            Mail::to($recipient)->send(new OperationsNotice(
                'Gisley Nunes — retornos pendentes',
                "Há retornos de atendimento aguardando no painel Gisley Nunes. Acesse o painel para consultar os contatos e as datas, sem dados pessoais por e-mail.\n".(string) config('app.admin_url').'/admin/#leads-view',
            ));
        } catch (\Throwable $error) {
            Cache::forget($key);
            Log::error('crm.reminders.email_failed', ['exception' => $error::class]);
            $this->warn('Unable to deliver CRM reminder email.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
