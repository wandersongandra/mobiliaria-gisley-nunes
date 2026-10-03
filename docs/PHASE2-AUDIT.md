# Auditoria adversarial do backend — Fase 2

Data da revisão: 2026-10-03. Base: `migration/laravel-backend-2026-10-02`. Esta auditoria reavaliou o código atual, as migrations, as rotas e os workflows. Ela não valida provedores externos sem credenciais/ambiente isolado.

## Arquitetura observada

Laravel 12/PHP 8.2+, Query Builder e serviços `AdminAccessService`, `CrmService`, `PropertyService` e `R2Storage`. Não há models Eloquent, Form Requests, policies, listeners ou filas próprias. O fluxo dominante é controller → service → Query Builder/R2. A aplicação é explicitamente single-tenant.

As rotas administrativas passam por `same-origin`, `admin`, throttle e capability. O papel é recalculado da tabela de acesso em cada requisição. O R2 recebe upload presigned e só ganha registro de foto após HEAD + inspeção de conteúdo. O catálogo público v1 é cacheado por inteiro; v2 é paginado.

## Findings

| ID | Severidade | Componente/evidência | Impacto e exploração | Correção/teste | Status |
| --- | --- | --- | --- | --- | --- |
| F2-R2-01 | HIGH | `R2Storage::imageInfoFromBytes()` só limitava largura/altura a 20.000. | PNG 20.000×20.000 podia induzir alocação/decode excessivo. | Teto de 40 milhões de pixels em `c70732a`; `UploadLifecycleTest::test_image_inspection_rejects_an_image_with_excessive_pixel_area`. | CORRIGIDO |
| F2-DB-01 | HIGH | `is_cover` não tinha invariante no banco. | Concorrência, importação ou acesso direto podia criar duas capas e duplicar joins/paginação. | Coluna gerada + UNIQUE em `2026_10_03_000004...`; `DataIntegrityConstraintTest`. | CORRIGIDO |
| F2-LEAD-01 | MEDIUM | `CrmService::exportLeads()` usava `get()` para todo resultado. | Exportações grandes de PII podiam exaurir memória PHP-FPM. | Cursor/stream CSV e JSON em `b0374ed`; `LeadManagementTest`. | CORRIGIDO |
| F2-LEAD-02 | MEDIUM | Leads já anonimizados continuavam com status e `updated_at` elegíveis. | Job reescrevia os mesmos registros em todas as execuções. | `anonymized_at` + índice, migration `000005`, teste de segunda execução. | CORRIGIDO |
| F2-ARCH-01 | MEDIUM | `GET /api/properties` e SSR chamam `publicCatalog()` completo. | Muitos imóveis aumentam memória/latência apesar do cache; invalidação recalcula tudo. | `GET /api/v2/properties` limita 20–100; teste com 10.000 linhas e no máximo 3 queries. v1/SSR seguem legados até migração do frontend. | MITIGADO |
| F2-DB-02 | HIGH | `morada_admin_sessions.open_id` não tem FK para `morada_admin_users.open_id`. | Sessões órfãs podem permanecer após manutenção direta de usuário; integridade não é garantida no banco. | Requer migration compatível: inventariar/revogar órfãs, tornar chave nullable se necessário e adicionar FK com política `ON DELETE`. Não aplicada sem prova em MySQL com dados. | ABERTO |
| F2-AUD-01 | HIGH | `AdminRequestContext::audit()` e `AuthController::auditAuthentication()` capturam falhas. | Alteração sensível pode ocorrer sem evidência se insert de auditoria falhar. | Classificar eventos: equipe, papel, convite, exclusão de mídia/imóvel, site sensível e logout-all devem ser transacionais/fail-closed ou outbox durável. Não aplicado: exige definir indisponibilidade aceitável e migração segura. | ABERTO |
| F2-CONC-01 | MEDIUM | `CrmService::createInvitation()` revoga e insere sem constraint de convite ativo por email. | Duas requisições simultâneas podem deixar tokens ativos paralelos; aceitação ainda encontra UNIQUE de equipe. | Criar coluna gerada de convite ativo + UNIQUE após saneamento de dados ou lock serial por email. | ABERTO |
| F2-CONC-02 | MEDIUM | Middleware valida sessão uma vez; revogação/role change pode correr durante request já autorizado. | Uma requisição administrativa em voo pode concluir após logout-all/revogação. | Definir token version ou lock transacional para operações críticas. Teste concorrente MySQL ainda necessário. | ABERTO |
| F2-AUTH-01 | MEDIUM | `morada_admin_users.email` é UNIQUE e OAuth usa `open_id` como identidade; nova identidade com mesmo email pode colidir em `establish()`. | Sem escalonamento confirmado, mas pode gerar 500/indisponibilidade e precisa de política explícita de account linking. | Separar identidade OAuth/usuário ou tratar conflito como 409 seguro; validar com provedor real. | ABERTO |
| F2-R2-02 | MEDIUM | Validação real depende de HEAD/GET R2; EXIF não é removido. | Sem teste no bucket não há prova de assinatura, expiração, lifecycle ou MIME real; EXIF pode conter geolocalização. | Testar bucket de staging; definir lifecycle R2 e transformação/remoção de EXIF compatível com upload presigned. | ABERTO (externo) |
| F2-RATE-01 | MEDIUM | Throttles usam `Request::ip()` e não há configuração de proxies Cloudflare observada. | Sem proxy confiável, muitos visitantes podem compartilhar IP Cloudflare e causar bloqueio; confiar cegamente em XFF permitiria bypass. | Configurar somente ranges Cloudflare atualizados no HostGator ou aplicar rate limit no WAF Cloudflare; validar IP efetivo em staging. | ABERTO (infra) |
| F2-CI-01 | LOW | CodeQL cobre apenas JavaScript/TypeScript; PHP depende de PHPStan e testes. | Menor cobertura de análise de segurança PHP, sem finding explorável confirmado. | Manter PHPStan obrigatório e considerar scanner PHP adicional em CI após avaliar ruído. | ABERTO |
| F2-UI-01 | LOW | `GET /admin` entrega HTML estático sem sessão. | Não expõe dados: endpoints administrativos exigem autenticação; permite apenas descoberta do painel. | Manter `noindex`; proteger no Cloudflare Access se a operação quiser ocultar a superfície. | ACEITO/DOCUMENTADO |

## Revalidação por área

- **Autenticação:** state OAuth tem TTL de 10 minutos, hash no DB, consumo transacional e comparação `hash_equals`; sessão Laravel é regenerada após autenticar. Sessões expiradas, revogadas e papel inativo são negados em `AdminAccessService::current()`. OAuth, repetição de code e account linking não foram validados contra o provedor real.
- **Autorização/IDOR:** a matriz de capabilities está em `AdminAccessService`; UUIDs administrativos são validados e mídia é ligada ao imóvel antes de registrar. Não foi encontrado endpoint administrativo sem middleware de autenticação/capability. Aplicação é single-tenant, portanto não há claim de isolamento entre imobiliárias.
- **SQL/XSS/SSRF/comandos:** consultas raw encontradas usam expressões constantes, sem interpolar request. Blade usa escaping padrão e nonce CSP. Não foram encontrados `exec`, `shell_exec`, `unserialize` ou fetch de URL controlada por usuário no Laravel.
- **R2:** allow-list: JPEG, PNG, WebP, AVIF; tamanho 1–12 MiB, chave aleatória por imóvel, expiração 60–3.600 s e `If-None-Match: *`. Conteúdo é conferido antes do registro; limpeza de órfãos ocorre após 24h. Falhas R2 são fail-closed no registro.
- **Banco:** status de imóvel e papel têm constraints; capa tem UNIQUE calculado. Slug tem UNIQUE e operação usa transação. FKs de fotos para imóvel existem. DB-02 e concorrência de convite continuam abertos.
- **Privacidade/LGPD:** leads guardam PII necessária à finalidade e passam por anonimização após dois anos em estado fechado/perdido. Logs de autenticação não registram token/cookie. Isto não é parecer de conformidade jurídica.
- **Supply chain/CI:** `composer.json` permite somente plugin `php-http/discovery`; workflows usam SHAs para actions, permissões mínimas e não usam `pull_request_target` nem `continue-on-error`. Não há workflow de deploy, portanto não existe concurrency de produção a configurar neste repositório.

## Auditoria transacional

**Critical audit:** mudança de equipe/papel/ativo, convites e revogação, remoção de equipe, arquivamento de imóvel, remoção de mídia, mudança de site e logout-all. Para estes eventos, o comportamento atual é fail-open de auditoria e deve mudar antes de aprovação de segurança.

**Best-effort audit:** login, logout, criação/edição de imóvel, ordenação de fotos, alteração de lead e export. Uma falha precisa ser logada com request ID, sem token/cookie/segredo. A classificação acima não substitui a decisão operacional sobre fail-closed.

## Evidência de gates

| Gate | Resultado |
| --- | --- |
| `composer validate --strict` | PASS local |
| `composer audit` | PASS local, sem advisories |
| `composer install --no-dev --optimize-autoloader` | EXECUTADO em worktree temporário isolado; instalação foi concluída e o worktree removido. A ferramenta local interrompeu a captura antes do código de saída, portanto não serve como PASS isolado. |
| PHPUnit | PASS local: 92 testes, 530 assertions, 0 falhas |
| Pint | PASS local |
| PHPStan/Larastan | PASS local: 0 erros |
| `php -l` | PASS local: 64 arquivos |
| `about`, `route:list`, `config:cache`, `route:cache`, `view:cache` | PASS local; caches foram limpos depois da verificação |
| MySQL 8 `migrate:fresh` e testes | BLOCKED: Docker ausente e serviços MySQL locais parados; não há banco isolado configurado |
| OAuth real, R2 real, HostGator real | BLOCKED: dependem de ambiente externo autorizado |
| Secret scan | PASS local: `pnpm security:secrets`; busca complementar encontrou apenas fixtures de teste `secret-test` |
| `app:production-check` | FAIL esperado no checkout local: APP_KEY, URLs HTTPS, credenciais MySQL, R2 e OAuth não estão configurados localmente; nenhum valor secreto foi emitido |

## Gate final

SECURITY FINDINGS: `CRITICAL 0`, `HIGH 2 abertos`, `MEDIUM 6 abertos`, `LOW 2 abertos`.

**BACKEND SECURITY GATE: FAIL** — DB-02 e AUD-01 são HIGH abertos, além de gates externos não executados.

**BACKEND PRODUCTION READINESS: FAIL** — não há evidência MySQL, R2, OAuth, HostGator ou rollback real completos.
