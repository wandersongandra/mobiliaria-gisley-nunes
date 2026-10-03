<?php

namespace App\Http\Controllers\Concerns;

use App\Services\CrmService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Helpers compartilhados pelos controllers administrativos.
 *
 * As classes que usam este trait precisam expor uma instância de CrmService na
 * propriedade $crm — ambas a injetam pelo construtor.
 *
 * @property-read CrmService $crm
 */
trait AdminRequestContext
{
    /**
     * @return array<string, mixed>
     */
    protected function admin(Request $request): array
    {
        $admin = $request->attributes->get('admin');
        if (! is_array($admin)) {
            throw new RuntimeException('AUTH_REQUIRED');
        }

        return $admin;
    }

    /**
     * Falha de auditoria não pode derrubar a operação que a originou.
     *
     * @param  array<string, mixed>  $admin
     * @param  array<string, mixed>|null  $details
     */
    protected function audit(array $admin, string $action, string $type, ?string $id = null, ?array $details = null): void
    {
        try {
            $this->crm->recordAudit($admin, $action, $type, $id, $details);
        } catch (\Throwable $error) {
            report($error);
        }
    }

    protected function assertId(string $id): string
    {
        if (! Str::isUuid($id)) {
            throw new RuntimeException('NOT_FOUND');
        }

        return $id;
    }
}
