<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

class SecurityOperationsMonitorTest extends TestCase
{
    use RefreshDatabase;

    public function test_monitor_reports_no_alerts_for_normal_activity(): void
    {
        $this->artisan('gisley:security-monitor', ['--fail-on-alert' => true])
            ->expectsOutputToContain('[OK] exports_per_hour=0 threshold=5')
            ->expectsOutputToContain('Security monitor: 0 alert(s)')
            ->assertSuccessful();
    }

    public function test_monitor_flags_export_bursts_without_exposing_actor_details(): void
    {
        config(['gisley.security.monitor.exports_per_hour' => 1]);
        for ($number = 0; $number < 2; $number++) {
            DB::table('morada_audit_log')->insert([
                'id' => (string) Str::uuid(),
                'actor_email' => 'confidential@example.test',
                'action' => 'lead.export',
                'entity_type' => 'lead',
                'created_at' => now(),
            ]);
        }

        Log::shouldReceive('warning')->once()->with('security.monitor.threshold_exceeded', [
            'metric' => 'exports_per_hour',
            'observed' => 2,
            'threshold' => 1,
        ]);

        $this->artisan('gisley:security-monitor', ['--fail-on-alert' => true])
            ->expectsOutputToContain('[ALERT] exports_per_hour=2 threshold=1')
            ->doesntExpectOutputToContain('confidential@example.test')
            ->assertFailed();
    }

    public function test_monitor_does_not_alert_on_events_outside_the_one_hour_window(): void
    {
        config(['gisley.security.monitor.exports_per_hour' => 1]);
        DB::table('morada_audit_log')->insert([
            'id' => (string) Str::uuid(),
            'actor_email' => 'confidential@example.test',
            'action' => 'lead.export',
            'entity_type' => 'lead',
            'created_at' => now()->subHours(2),
        ]);

        $this->artisan('gisley:security-monitor', ['--fail-on-alert' => true])
            ->expectsOutputToContain('[OK] exports_per_hour=0 threshold=1')
            ->assertSuccessful();
    }
}
