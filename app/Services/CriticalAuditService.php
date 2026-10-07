<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\DB;

class CriticalAuditService
{
    public function __construct(private readonly CrmService $crm) {}

    /**
     * Executa mutação e trilha crítica na mesma transação do banco. A ação só
     * é confirmada se o INSERT append-only da auditoria também for confirmado.
     * Serviços externos permanecem fora desta fronteira e usam compensação.
     */
    public function run(
        array $admin,
        string $action,
        string $entityType,
        ?string $entityId,
        Closure $mutation,
        array|Closure|null $details = null,
    ): mixed {
        return DB::transaction(function () use ($admin, $action, $entityType, $entityId, $mutation, $details): mixed {
            $result = $mutation();
            $auditEntityId = $entityId;
            if ($auditEntityId === null && is_array($result) && isset($result['id'])) {
                $auditEntityId = (string) $result['id'];
            }
            $auditDetails = $details instanceof Closure ? $details($result) : $details;
            $this->crm->recordAudit($admin, $action, $entityType, $auditEntityId, $auditDetails);

            return $result;
        });
    }
}
