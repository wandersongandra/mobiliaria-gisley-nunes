# Fase 3 — fechamento arquitetural e validação externa

Data: 2026-10-03. Este relatório separa controles verificados no checkout de
evidências que só podem ser obtidas em infraestrutura autorizada.

| ID | Severidade | Evidência | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- |
| DB-02 | HIGH | Sessões antigas só guardavam `open_id`; não havia FK de usuário. | Migration backward-compatible cria `morada_users`, `morada_oauth_identities`, FKs de sessão e backfill que revoga legado não verificável. | `OAuthIdentityTest::test_sessions_cannot_reference_a_nonexistent_user` e CI MySQL 8. | CORRIGIDO. |
| AUD-01 | HIGH | Mutações sensíveis podiam concluir se a inserção de auditoria falhasse. | `CriticalAuditService` usa uma transação para mutação e audit; trigger bloqueia update/delete. | `AuditIntegrityTest` e CI MySQL 8. | CORRIGIDO. |
| OAUTH-03 | MEDIUM | E-mail não é identidade estável e primeiro login podia colidir. | Chave única `(provider, provider_subject)`, sem link implícito por e-mail e retry limitado após colisão. | `OAuthIdentityTest`. | CORRIGIDO local; OAuth real BLOCKED. |
| INV-02 | MEDIUM | Dois convites ativos para o mesmo e-mail podiam concorrer. | Índice único em convite ativo, lock e retry limitado. | `InvitationConcurrencyTest` e CI MySQL 8. | CORRIGIDO. |
| SES-04 | MEDIUM | Uma requisição já autenticada podia passar pela revogação antes da mutação. | Ações críticas revalidam sessão no limite de execução. | `SecurityContractTest::test_critical_boundary_revalidates_a_session_after_logout_all`. | MITIGADO. |
| NET-01 | MEDIUM | Headers encaminhados podiam ser confiados sem origem do proxy. | Apenas `TRUSTED_PROXIES` libera X-Forwarded; `CF-Connecting-IP` é ignorado. | `TrustedProxyTest`. | CORRIGIDO no código; ranges reais Cloudflare BLOCKED. |
| ARCH-01 | MEDIUM | Catálogo v1 retornava toda a lista. | Frontend usa v2 com paginação/filtros no banco; v1 emite depreciação e permanece compatível. | `PublicCatalogPaginationTest` com 10.000 linhas. | CORRIGIDO; remover v1 depende de consumidores externos. |
| FILE-01 | MEDIUM | Laravel registrava serving do disco local não usado. | `config/filesystems.php` desativa a rota local. | `RouteSurfaceTest::test_local_storage_routes_are_not_registered`. | CORRIGIDO local. |
| R2-01 | MEDIUM | Não existem credenciais de bucket de teste autorizadas neste checkout. | Controles locais e limpeza órfã permanecem; teste real não foi simulado. | Não executado por segurança. | BLOCKED. |

## Semântica de revogação

Uma ação crítica consulta a sessão novamente antes de sua unidade de trabalho.
Uma mutação que já tenha passado do commit antes de `logout-all` não pode ser
desfeita de forma retroativa; essa é a janela residual documentada. O serviço
não promete cancelamento de uma requisição já concluída.

## Migração de identidade

Cada identidade OAuth é vinculada pelo subject imutável do provider. Mesmo
e-mail em providers ou subjects distintos cria contas distintas até haver fluxo
administrativo explícito de vinculação. E-mail alterado pelo provider atualiza
o perfil da mesma identidade. Exclusões de usuários/identidades usam `RESTRICT`
para impedir apagar sessões ou trilha de auditoria por acidente; bloquear ou
revogar é a operação administrativa prevista.

## Estado dos gates nesta etapa

- `composer validate --strict`: PASS.
- `composer audit`: PASS, sem advisories.
- PHPUnit: PASS, 107 testes e 573 assertions.
- Pint: PASS.
- PHPStan/Larastan: PASS.
- PHP syntax, secret scan, build do frontend e caches Laravel: PASS.
- Pacote de produção: PASS em checkout limpo com `composer install --no-dev`,
  boot, rotas, caches e `app:production-check`, sem Node.
- MySQL 8 real: PASS no job obrigatório do GitHub Actions (`migrate:fresh`,
  testes de contrato, constraints, caches e rollback da migration). O job
  configura a permissão de trigger somente no container efêmero; a mesma
  pré-condição precisa ser confirmada na HostGator.
- R2 real, OAuth real, Cloudflare/HostGator real: BLOCKED por ausência de
  ambiente de teste autorizado.

**BACKEND SECURITY GATE: FAIL** até as validações reais de R2, OAuth e proxy
Cloudflare documentadas.
**BACKEND PRODUCTION READINESS: FAIL** até R2, OAuth e HostGator reais.
