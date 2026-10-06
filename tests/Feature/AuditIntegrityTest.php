<?php

namespace Tests\Feature;

use App\Services\CriticalAuditService;
use App\Services\CrmService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class AuditIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_critical_mutation_rolls_back_when_audit_insert_fails(): void
    {
        DB::table('morada_site_settings')->insert([
            'id' => 1,
            'area' => 'Antes',
            'updated_at' => now(),
        ]);
        $crm = new class extends CrmService
        {
            public function recordAudit(array $admin, string $action, string $entityType, ?string $entityId = null, ?array $details = null): void
            {
                throw new RuntimeException('audit unavailable');
            }
        };
        $critical = new CriticalAuditService($crm);

        try {
            $critical->run(
                ['email' => 'manager@example.test', 'userId' => null],
                'site.update',
                'site',
                '1',
                static fn (): int => DB::table('morada_site_settings')->where('id', 1)->update(['area' => 'Depois']),
            );
            $this->fail('A indisponibilidade de auditoria deveria cancelar a mutação crítica.');
        } catch (RuntimeException $error) {
            $this->assertSame('audit unavailable', $error->getMessage());
        }

        $this->assertSame('Antes', DB::table('morada_site_settings')->where('id', 1)->value('area'));
    }

    public function test_critical_mutation_derives_created_entity_id_and_details_after_mutation(): void
    {
        $crm = new class extends CrmService
        {
            public ?string $entityId = null;

            /** @var array<string, mixed>|null */
            public ?array $details = null;

            public function recordAudit(array $admin, string $action, string $entityType, ?string $entityId = null, ?array $details = null): void
            {
                $this->entityId = $entityId;
                $this->details = $details;
            }
        };
        $critical = new CriticalAuditService($crm);

        $result = $critical->run(
            ['email' => 'manager@example.test', 'userId' => null],
            'property.create',
            'property',
            null,
            static fn (): array => ['id' => 'property-123', 'status' => 'draft'],
            static fn (array $created): array => ['status' => $created['status']],
        );

        $this->assertSame('property-123', $crm->entityId);
        $this->assertSame(['status' => 'draft'], $crm->details);
        $this->assertSame('property-123', $result['id']);
    }

    public function test_audit_log_accepts_inserts_but_rejects_updates_and_deletes(): void
    {
        $id = (string) Str::uuid();
        DB::table('morada_audit_log')->insert([
            'id' => $id,
            'actor_email' => 'manager@example.test',
            'action' => 'test.insert',
            'entity_type' => 'test',
            'created_at' => now(),
        ]);

        try {
            DB::table('morada_audit_log')->where('id', $id)->update(['action' => 'test.update']);
            $this->fail('O banco aceitou UPDATE no log de auditoria.');
        } catch (QueryException) {
            $this->assertDatabaseHas('morada_audit_log', ['id' => $id, 'action' => 'test.insert']);
        }

        $this->expectException(QueryException::class);
        DB::table('morada_audit_log')->where('id', $id)->delete();
    }
}
