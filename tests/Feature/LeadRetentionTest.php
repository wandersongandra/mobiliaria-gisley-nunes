<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class LeadRetentionTest extends TestCase
{
    use RefreshDatabase;

    public function test_expired_closed_and_lost_leads_are_anonymized_but_recent_or_open_leads_are_preserved(): void
    {
        $expiredLost = $this->createLead('perdido', now()->subYears(2)->subDay());
        $expiredClosed = $this->createLead('fechado', now()->subYears(3));
        $oldOpen = $this->createLead('new', now()->subYears(4));
        $recentLost = $this->createLead('perdido', now()->subYear());
        $reopened = $this->createLead('new', now()->subDay(), now()->subYears(4));

        $this->artisan('gisley:anonymize-expired-leads')
            ->expectsOutputToContain('Anonymized 2 expired lead(s).')
            ->assertSuccessful();

        foreach ([$expiredLost, $expiredClosed] as $id) {
            $this->assertDatabaseHas('morada_contact_leads', [
                'id' => $id,
                'name' => 'Contato anonimizado',
                'email' => 'anonimizado+'.$id.'@invalid.local',
                'message' => 'Dados pessoais removidos conforme política de retenção.',
                'property_path' => null,
            ]);
            $this->assertNotNull(DB::table('morada_contact_leads')->where('id', $id)->value('anonymized_at'));
        }

        $this->assertDatabaseHas('morada_contact_leads', [
            'id' => $oldOpen,
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.test',
        ]);
        $this->assertDatabaseHas('morada_contact_leads', [
            'id' => $recentLost,
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.test',
        ]);
        $this->assertDatabaseHas('morada_contact_leads', [
            'id' => $reopened,
            'status' => 'new',
            'name' => 'Cliente Teste',
        ]);

        $this->artisan('gisley:anonymize-expired-leads')
            ->expectsOutputToContain('Anonymized 0 expired lead(s).')
            ->assertSuccessful();
    }

    private function createLead(string $status, mixed $updatedAt, mixed $createdAt = null): string
    {
        $id = (string) Str::uuid();
        DB::table('morada_contact_leads')->insert([
            'id' => $id,
            'name' => 'Cliente Teste',
            'email' => 'cliente@example.test',
            'interest' => 'Quero comprar um imóvel',
            'message' => 'Procuro um apartamento.',
            'property_path' => '/imoveis/apartamento-teste',
            'status' => $status,
            'created_at' => $createdAt ?? $updatedAt,
            'updated_at' => $updatedAt,
        ]);

        return $id;
    }
}
