<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PanelNotificationService
{
    public function newLead(string $leadId): void
    {
        $recipients = DB::table('morada_staff_access')
            ->where('active', true)
            ->where('role', 'manager')
            ->pluck('email');

        foreach ($recipients as $recipient) {
            $this->insert((string) $recipient, $leadId, 'new_lead', 'new:'.$leadId);
        }
    }

    public function queueDueReminders(): int
    {
        // Notifications are operational, not a permanent CRM archive.
        DB::table('morada_panel_notifications')->where('created_at', '<', now()->subDays(90))->delete();
        $day = now()->toDateString();
        $managers = DB::table('morada_staff_access')
            ->where('active', true)->where('role', 'manager')->pluck('email')->all();
        $staff = DB::table('morada_staff_access')
            ->where('active', true)->pluck('email')->all();
        $active = array_fill_keys($staff, true);
        $created = 0;

        DB::table('morada_contact_leads')
            ->whereNotNull('follow_up_date')
            ->where('follow_up_date', '<=', $day)
            ->whereNotIn('status', ['fechado', 'perdido', 'closed', 'lost'])
            ->select(['id', 'assigned_to_email'])
            ->chunkById(200, function ($due) use (&$created, $active, $managers, $day): void {
                foreach ($due as $lead) {
                    $assignee = (string) ($lead->assigned_to_email ?? '');
                    $recipients = $assignee !== '' && isset($active[$assignee]) ? [$assignee] : $managers;
                    foreach ($recipients as $email) {
                        $created += $this->insert((string) $email, (string) $lead->id, 'follow_up', 'due:'.$day.':'.$lead->id);
                    }
                }
            });

        return $created;
    }

    /** @return array{items: array, unread: int} */
    public function inbox(string $email): array
    {
        $query = DB::table('morada_panel_notifications')->where('recipient_email', strtolower($email));

        return [
            'unread' => (clone $query)->whereNull('read_at')->count(),
            'items' => $query->orderByDesc('created_at')->orderByDesc('id')->limit(40)
                ->get(['id', 'kind', 'lead_id', 'read_at', 'created_at'])
                ->map(static fn ($item): array => [
                    'id' => (string) $item->id,
                    'kind' => (string) $item->kind,
                    'leadId' => (string) $item->lead_id,
                    'readAt' => $item->read_at,
                    'createdAt' => $item->created_at,
                ])->all(),
        ];
    }

    public function markRead(string $email, string $id): bool
    {
        $query = DB::table('morada_panel_notifications')
            ->where('recipient_email', strtolower($email))
            ->where('id', $id);

        if ((clone $query)->whereNull('read_at')->update(['read_at' => now()]) > 0) {
            return true;
        }

        return $query->exists();
    }

    private function insert(string $email, string $leadId, string $kind, string $reference): int
    {
        $email = strtolower($email);

        return DB::table('morada_panel_notifications')->insertOrIgnore([
            'id' => (string) Str::uuid(),
            'recipient_email' => $email,
            'lead_id' => $leadId,
            'kind' => $kind,
            'dedupe_key' => hash('sha256', $email.':'.$reference),
            'created_at' => now(),
        ]);
    }
}
