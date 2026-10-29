# Segunda rodada — revisão defensiva de entradas e auditoria

Data: 29/10/2026. Base: PR #57, head validado anteriormente `78e1d556672c08e329dfa1dbcb06eb7d4fbfeb4d`. Escopo: CRM, formulário público, propriedades, equipe, presign e logs de auditoria. Sem operação em produção.

## Evidências de código e correções

| ID | Estado / gravidade | Causa confirmada | Correção e teste negativo |
| --- | --- | --- | --- |
| SEC-17 | CONFIRMADO / baixo | `CrmService::text`, `email` e alguns controllers convertiam `array` em string; JSON de tipo inválido podia causar erro interno 500 ou valor `Array`. | Rejeição de tipos não escalares, `interest`, `status`, `role`, `name`, `pairingCode`, caminho/MIME de presign; `BackendContractTest`, `SecurityContractTest` e `PropertyPricePresentationTest` verificam 400 e ausência de mutação. Honeypot não grava resposta falsa. |
| SEC-18 | CONFIRMADO / baixo | `saveProfile()` validava a forma e o limite temporal de `birthDate`, mas não a existência da data no calendário. | `checkdate` e testes de datas impossíveis, preservando data bissexta válida; a barreira existente a datas futuras foi mantida. |
| SEC-19 | CONFIRMADO / médio | `isSensitiveAuditKey()` tinha nomes fixos; variantes como `passwordConfirmation` e `sessionJti` não eram ocultas. | Sanitização por componentes nomeados e regressão em `AuditIntegrityTest`; `tokenStoredAsHash` permanece flag booleano de segurança permitida. |

Os casos foram confirmados no fluxo de execução estático antes de mudar código; **não representam exploração demonstrada em hospedagem**. A versão anterior já tinha autorização e validação de campos comuns.

## Validação e limites

- Baseline anterior: cinco workflows do head `78e1d556` verdes (Laravel CI/MySQL, quality gates/PHPStan/Pint, pacote de produção, dependências e CodeQL).
- Esta rodada deve repetir o mesmo conjunto de checks no novo commit; sem PHP no executor local, os resultados do GitHub Actions são a fonte de execução de PHPUnit/MySQL/PHPStan.
- Revisão pós-merge e testes de integração operacional em HostGator continuam pendentes; a PR não autoriza deploy automático.
- Sem afirmação de cobertura exaustiva: classes de problemas de validação ainda precisam de fuzzing autenticado em ambiente de teste.
