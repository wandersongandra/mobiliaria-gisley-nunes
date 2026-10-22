# Auditoria final de hardening e homologação — 2026-10-22

## A. Resumo executivo

Revisão independente da PR #27 na branch `security/final-hardening-2026-10-22`,
com baseline limpo em worktree separado e validação do estado local. Não houve
merge, deploy, rollback, alteração de DNS, aplicação de CORS ou acesso a
produção.

Foram confirmados e corrigidos nesta continuação:

- a sonda PHP-FPM do deploy podia usar nome previsível, deixar temporários em
  falhas/interrupções, aceitar resposta insuficientemente validada, ser afetada
  por cache e expor o token em argumento de processo;
- a regra WAF documentada usava campos/forma incompatíveis com o Ruleset Engine;
- `presignGet` usava `ResponseContent-Type`, nome não reconhecido pelo AWS SDK,
  e não fixava `ResponseCacheControl`; o teste de regressão falhou antes da
  correção e passou depois.
- lacunas de evidência em OAuth, sessão, autorização, rate limit, SQLi,
  mass assignment e consistência R2↔MySQL receberam testes comportamentais;
  nenhum desses testes revelou bypass de produção.
- o teste Playwright paralelo foi reproduzido com OOM; a configuração agora
  fixa um worker e mantém todos os testes, e a suíte final passou com 21/21.
- a documentação WAF passou a registrar truncamento/padding e requisitos
  Enterprise, e o plano de migração PHP 8.2→8.3/8.4 foi versionado.

O código está **READY WITH CONDITIONS** para homologação. Não há CRITICAL ou
HIGH de código confirmado aberto nesta revisão. PHP-FPM/HostGator, R2 real,
CORS efetivo, WAF, OAuth externo, banco de staging e upload real continuam sem
prova externa. Logo, produção permanece **BLOCKED**.

PHP 8.2.35 existe e foi usado nesta sessão por binário oficial temporário; a
série 8.2 recebe correções de segurança até 2026-12-31. O floor do AWS SDK foi
fixado no release atualmente testado (`^3.400.1`). Planejar migração para
8.3/8.4 em PR separada, sem migrar nesta.

## A.1 Matriz de cobertura de autenticação e dados

Os testes abaixo foram executados nesta sessão. `PASS` significa teste de
comportamento aprovado; a ausência de um achado não é inferida de configuração.

| Área | Controle | Teste (`arquivo::método`) | Status | Evidência |
|---|---|---|---|---|
| OAuth | `code` escalar/canônico | `tests/Feature/OAuthIdentityTest.php::test_callback_rejects_array_query_parameters_before_external_exchange`; `test/auth.test.js::parâmetros OAuth aceitam somente valores escalares e canônicos` | PASS | PHPUnit/Node focados: exit 0; 40 testes PHP e 64 testes Node aprovados |
| OAuth | `state` vinculado à sessão | `tests/Feature/OAuthIdentityTest.php::test_callback_rejects_a_state_that_is_not_bound_to_the_session`; `test/auth-session.test.js::state OAuth usa hash estável e comparação segura de tamanho fixo` | PASS | Callback rejeitou state divergente antes da troca externa; Node security exit 0 |
| OAuth | expiração | `tests/Feature/Security/SessionRevocationTest.php::test_expired_auth_challenge_is_rejected` | PASS | Challenge expirado retornou `null`; suíte focada exit 0 |
| OAuth | uso único/replay | `tests/Feature/OAuthIdentityTest.php::test_callback_consumes_the_oauth_challenge_and_rejects_replay`; `tests/Feature/Security/SessionRevocationTest.php::test_auth_challenge_cannot_be_consumed_twice` | PASS | Primeiro callback controlado; repetição 400; suíte focada exit 0 |
| OAuth | redirect sem open redirect | `tests/Feature/OAuthIdentityTest.php::test_login_builds_google_authorization_request_with_the_public_callback`; `test_login_can_use_neutral_callback_path_for_host_waf_compatibility` | PASS | `redirect_uri` foi canônica/configurada, sem parâmetro arbitrário; exit 0 |
| OAuth | erro do provedor | `tests/Feature/OAuthIdentityTest.php::test_callback_returns_a_controlled_error_when_the_provider_rejects_the_code` | PASS | Resposta 400 genérica sem stack trace; exit 0 |
| OAuth | timeout/indisponibilidade | `tests/Feature/OAuthIdentityTest.php::test_callback_returns_a_controlled_error_when_the_provider_times_out` | PASS | `ConnectionException` sintética resultou em 400 controlado; exit 0 |
| Sessão | fixation/regeneração de ID | `tests/Feature/Security/SessionRevocationTest.php::test_establish_regenerates_the_framework_session_id` | PASS | ID antes/depois foi diferente; exit 0 |
| Sessão | cookies Secure/HttpOnly/SameSite/`__Host-` | `test/auth.test.js::cookies administrativos mantêm flags seguras esperadas`; `test/auth-session.test.js::cookies de produção usam prefixo __Host e flags fortes` | PASS | Node security: 64 pass, 0 fail |
| Sessão | expiração absoluta/idle | `tests/Feature/Security/SessionRevocationTest.php::test_expired_session_is_rejected_even_without_explicit_revocation`; `::test_idle_timeout_revokes_long_inactive_session` | PASS | Sessões foram rejeitadas/revogadas; exit 0 |
| Sessão | logout/revogação | `tests/Feature/Security/SessionRevocationTest.php::test_revoked_session_is_immediately_rejected_with_401`; `::test_logout_all_revokes_every_session_for_the_user`; `tests/Feature/SecurityContractTest.php::test_logout_and_logout_all_write_an_audit_event_without_exposing_session_ids` | PASS | JTI revogado rejeitado e logout-all revogou todas; exit 0 |
| Autorização | admin versus comum | `test/authorization.test.js::editor recebe 403 em todas as rotas exclusivas de gestor`; `tests/Feature/SecurityContractTest.php::test_editor_can_save_drafts_but_cannot_publish_or_delete_leads` | PASS | Capacidades e mutações indevidas retornaram 403; Node/PHP exit 0 |
| Autorização | não autenticado em API privada | `tests/Feature/BackendContractTest.php::test_admin_session_and_protected_api_contract` | PASS | Sessão anônima/API privada rejeitadas com 401; exit 0 |
| Autorização | IDOR/BOLA/ownership de mídia | `test/storage.test.js::caminho de storage pertence somente ao imóvel esperado`; `tests/Feature/UploadLifecycleTest.php::test_storage_key_boundary_rejects_ambiguous_or_unsafe_paths` | PASS | Chaves fora do imóvel e caminhos ambíguos rejeitados; exit 0 |
| Rate limit | login por IP e resposta HTTP fail-closed | `tests/Feature/RequestBoundaryTest.php::test_auth_login_is_rate_limited_after_thirty_attempts_from_one_ip`; `test/rate-limit.test.js::rate limiter aceita até o limite e bloqueia a requisição seguinte` | PASS | 31ª tentativa retornou 429, `RATE_LIMITED` e `Retry-After`; PHP/Node exit 0 |
| SQLi | filtros públicos parametrizados | `tests/Feature/PublicCatalogPaginationTest.php::test_v2_catalog_treats_sql_fragments_as_values_not_query_code` | PASS | payload SQL foi tratado como valor e retornou total 0; exit 0 |
| Mass assignment | payload não escala privilégio/publicação | `test/authorization.test.js::editor não cria imóvel publicado ou destacado por payload adulterado`; `::persistência também impede Editor de publicar ou destacar` | PASS | payload adulterado não elevou capacidades; Node security exit 0 |
| R2 ↔ MySQL | confirmação/metadata antes do registro | `tests/Feature/UploadLifecycleTest.php::test_photo_registration_rejects_actual_object_size_mismatch`; `::test_photo_registration_rejects_dimensions_that_do_not_match_the_object` | PASS | objeto inconsistente não foi registrado; PHPUnit de upload exit 0 |
| R2 ↔ MySQL | órfãos/remoção/consistência | `tests/Feature/UploadLifecycleTest.php::test_scheduled_cleanup_deletes_old_unregistered_objects_only` | PASS parcial | cleanup coberto localmente; remoção transacional em R2 real ainda NOT VERIFIED |

### Ciclo das lacunas

- As lacunas de OAuth, sessão, SQLi e mass assignment eram lacunas de prova,
  não vulnerabilidades confirmadas: os novos testes foram adicionados e
  passaram sem alteração permissiva no código de produção.
- O primeiro teste do rate limit falhou por defeito do próprio harness (`no
  such table: morada_auth_challenges`); a causa foi a ausência de
  `RefreshDatabase`, corrigida no teste. A regressão final passou com o
  middleware real acionado e `ThrottleRequestsException` observado.
- A regressão do rate limit também falhou com `APP_DEBUG=false`: o limite
  acionado atravessava o handler de exceções e virava HTTP 500. A causa raiz
  era o tratamento genérico de `ThrottleRequestsException`; o handler agora
  responde 429 sem detalhes internos, e a regressão confirmou `RATE_LIMITED`
  e `Retry-After`.
- O fluxo R2↔MySQL já tinha testes de regressão; a prova local passou, mas não
  substitui a confirmação contra bucket e banco de staging.

## B. Vulnerabilidades e riscos

| Severidade | Localização | Causa raiz | Evidência | Impacto | Correção | Situação |
|---|---|---|---|---|---|---|
| MEDIUM | `scripts/deploy-hostgator.sh` | Sonda com arquivo previsível, limpeza incompleta, resposta pouco validada e token em header de argumento | Prova estática pré-correção encontrou `secure-temp-file`, `signal-cleanup` e `probe-cache-hardening` ausentes; teste mock pós-correção cobriu sucesso, corpo inválido e TERM | Deploy poderia validar cache/worker errado, deixar diagnóstico público ou expor token no process list | `mktemp`, CSPRNG, config temporário do curl, `umask 077`, headers/body separados, cache-buster, validação de JSON/SAPI/headers e traps HUP/INT/TERM/EXIT | CONFIRMED → CORRIGIDO; PASS |
| MEDIUM | `docs/security/cloudflare-waf-php2shell.txt` | Uso de `http.request.body` e comparação de mapa de cookies com `contains` | Campos foram comparados com a referência oficial do Ruleset Engine; auditoria estática pós-correção não encontrou os campos inválidos nem hostname de produção | Regra poderia não compilar ou aparentar cobertura sem bloquear | Expressão com `http.request.body.raw`, `http.cookie`, limites/plano documentados e escopo somente staging | CONFIRMED → CORRIGIDO; PASS |
| MEDIUM | `app/Services/R2Storage.php` | `ResponseContent-Type` não era o nome do parâmetro SDK e cache de GET não era fixado | Teste falhou: `response-content-type` ausente; após `ResponseContentType` + `ResponseCacheControl`, 24 testes passaram | Navegador poderia receber tipo diferente do esperado e mídia administrativa poderia ser reutilizada por cache | Parâmetros SDK corretos, allowlist de cache público curto/privado sem cache e admin usando `private, no-store` | CONFIRMED → CORRIGIDO; PASS |
| MEDIUM | `composer.json` + `app/Services/R2Storage.php` | Constraint `^3.0` permitia resolver SDK abaixo do release efetivamente testado, embora o signer dependa dos hooks protegidos de presign | Código estende `S3SignatureV4::getHeaderBlacklist()`/`getPresignHeaderDenyList()`; lock testado em 3.400.1 e teste confirma `Content-Type`/`If-None-Match` assinados | Regeneração do lock poderia produzir combinação sem o contrato de assinatura validado, enfraquecendo anti-replay | Floor fixado em `aws/aws-sdk-php ^3.400.1`; lock atualizado somente no `content-hash` | CONFIRMED (compatibilidade de segurança) → CORRIGIDO; PASS |
| LOW | `bootstrap/app.php` | `ThrottleRequestsException` caía no tratamento genérico e podia devolver 500 quando o limite era atingido com debug desativado | Regressão pré-correção: exit 1, esperado 429 e recebido 500; CI MySQL também falhou na mesma fronteira | Clientes e monitoramento recebiam erro interno em vez de sinal de rate limit; o bloqueio não era bypassado | Mapeamento explícito para 429, `RATE_LIMITED` e headers do framework; teste usa IP determinístico | CONFIRMED → CORRIGIDO; PASS |
| LOW | `playwright.config.js` / suíte browser | Workers paralelos excedem os recursos disponíveis e podem abortar processos; não é vulnerabilidade de runtime | Execução medida com 4 workers registrou 7.976 MB de RAM física, pico de 517 MB nos 7 processos novos e falha por pressão; nova execução com 8 workers terminou com `ERR_INSUFFICIENT_RESOURCES`, 8 falhas e 13 pass; 4 workers também passou em tentativa posterior | CI/local pode produzir falso negativo, processos podem ser abortados e mascarar regressões | `workers: 1` explícito, `fullyParallel: false`, sem reduzir os 21 cenários; serial final PASS | CONFIRMED → MITIGADO; monitorar no CI |
| INFORMATIONAL | `docs/security/cloudflare-waf-php2shell.txt` | Fallback regex ainda dependia de `http.request.body.raw` e não resolvia plano sem body inspection | Auditoria contra documentação Cloudflare: `body.raw`, `body.truncated`, `body.mime`, `body.form` e `body.size` têm requisitos/limites de plano; fallback não era independente | Operador poderia acreditar em cobertura inexistente | Seção removida; regra permanece adicional e PHP/FPM é controle primário | CORRIGIDO; staging NOT VERIFIED |
| HIGH residual | HostGator/PHP-FPM | Runtime web real não foi acessado | CLI 8.2.35 passou; FPM remoto não foi sondado | FPM abaixo do patch mínimo pode manter exposição ao PHP2Shell | Gate fail-closed e roteiro de staging | NOT VERIFIED; sem confirmação remota |
| MEDIUM residual | R2/CORS/OAuth/WAF efetivos | Integrações externas não disponíveis/permitidas nesta sessão | Nenhum bucket, zone, client OAuth ou domínio de staging autorizado foi identificado | Configuração efetiva pode divergir da proposta local | Checklist executável de homologação | NOT VERIFIED |
| LOW | Pint global | Divergências de estilo em 16 arquivos fora do diff desta tarefa | Global exit 1; nenhum dos 16 caminhos retornados coincide com os arquivos modificados nesta continuação | Ruído de qualidade, sem evidência de falha de segurança | PR de estilo separada; não reformatado aqui | FAIL preexistente/fora do escopo |

Vetor PHP2Shell em até três linhas: um multipart malicioso pode atingir o
processamento de upload/progresso de sessão antes do fluxo normal da aplicação.
Em runtime vulnerável isso pode permitir corrupção, execução ou exaustão de
recursos. A defesa exige PHP-FPM corrigido, upload progress desabilitado e
limites de corpo efetivos.

## C. Correções implementadas

| Arquivo | Alteração | Motivo |
|---|---|---|
| `scripts/deploy-hostgator.sh` | Sonda efêmera aleatória, token CSPRNG, arquivo de configuração curl 600, cache-busters, validação de headers/corpo JSON/SAPI, limpeza em EXIT/HUP/INT/TERM e fail-closed | Impedir acesso/reuso da sonda e aceitar somente o FPM seguro do vhost |
| `scripts/test-deploy-hostgator.sh` | Mock de sucesso, corpo inseguro, cache-buster/headers e interrupção TERM | Provar comportamento da sonda sem deploy |
| `.github/workflows/hostgator-preflight.yml` | `bash -n`, ShellCheck e teste mock no preflight | Evitar regressões do gate de deploy |
| `app/Services/R2Storage.php` | `ResponseContentType`, `ResponseCacheControl` com allowlist e assinatura explícita | Fixar headers efetivos do objeto R2 |
| `app/Http/Controllers/AdminPropertyController.php` | GET administrativo usa `private, no-store` | Evitar cache compartilhado de mídia privada |
| `tests/Feature/UploadLifecycleTest.php` | Testes para headers/cache assinados e política inválida | Regressão para o defeito confirmado |
| `docs/security/cloudflare-waf-php2shell.txt` | Campos válidos, limites de plano e uso exclusivamente em staging | Evitar regra WAF inexequível e alteração de produção |
| `docs/homologacao-checklist.md` | Probe FPM com nome/cache-buster e consulta WAF em zone de staging | Homologação reproduzível |
| `docs/cloudflare-r2-admin.md` | Ferramentas/formato `rules.allowed` versus PascalCase e comportamento de formato incorreto | Evitar aplicar CORS na ferramenta errada |
| `docs/cors.proposed.json` | Mantido como proposta PascalCase rastreada, sem wildcard/localhost/preview | Interoperabilidade sem tocar no `cors.json` local |
| `docs/security/php-migration-plan.md` | Matriz CI 8.2.35/8.3/8.4, prazo antes do fim de suporte e gate HostGator | Planejar migração sem reduzir o mínimo nesta PR |
| `playwright.config.js` | `workers: 1` documentado, mantendo todos os testes | Evitar OOM por concorrência local |
| `admin/main.js` / `public/admin/main.js` | Skip link preserva a view; refresh de equipe pendente é enfileirado; dashboard foca `#page-title` | Corrigir achados válidos do CodeRabbit |
| `tests/Feature/OAuthIdentityTest.php` | State divergente, replay, erro do provedor e timeout | Fechar lacunas de cobertura OAuth |
| `tests/Feature/Security/SessionRevocationTest.php` | Regeneração de ID de sessão | Provar proteção contra fixation |
| `tests/Feature/RequestBoundaryTest.php` | Rate limit efetivo da rota de login | Provar o controle no middleware real |
| `bootstrap/app.php` | Resposta JSON 429 para `ThrottleRequestsException` | Evitar que o limite seja reportado como erro 500 |
| `tests/Feature/PublicCatalogPaginationTest.php` | Fragmento SQL tratado como valor | Regressão explícita contra SQLi |
| `tests/browser/admin.smoke.spec.js` | Skip link e refresh concorrente da equipe | Regressões E2E para os achados CodeRabbit |
| `composer.json` / `composer.lock` | Floor AWS SDK `^3.400.1` e atualização apenas do hash do lock | Fixar o contrato de presign testado |
| `docs/BACKUP-RECOVERY.md` | Runbook de rollback com seis gates operacionais | Reversibilidade sem rollback destrutivo |

`cors.json` local continua não rastreado, preexistente e fora dos commits/PR.
`docs/cors.proposed.json` permanece a proposta documentada; nada foi aplicado em
bucket real.

## D. Testes e evidências

| Teste | Comando | Exit code | Status | Evidência |
|---|---|---:|---|---|
| Baseline PHPUnit limpo | `vendor/bin/phpunit --testsuite=Feature --do-not-cache-result` com PHP 8.2.35 em worktree HEAD | 0 | PASS | `OK (170 tests, 826 assertions)` |
| Regressão R2 antes da correção | filtro de `UploadLifecycleTest` | 1 | FAIL esperado | `response-content-type` ausente por parâmetro SDK incorreto |
| Regressão R2 depois | mesmo filtro | 0 | PASS | `OK (24 tests, 65 assertions)` |
| PHPUnit antes desta continuação | mesmo comando, PHP 8.2.35 | 0 | PASS | `OK (172 tests, 831 assertions)`; referência do estado anterior |
| Rate limit antes da correção | PHPUnit focado com `APP_DEBUG=false` | 1 | FAIL esperado | resposta limitada foi 500, não 429 |
| Rate limit após a correção | mesmo filtro, PHP 8.2.35 | 0 | PASS | `OK (1 test, 33 assertions)`; 429, `RATE_LIMITED` e `Retry-After` |
| PHPUnit final desta continuação | mesmo comando, PHP 8.2.35 oficial temporário, cache de arquivo | 0 | PASS | `OK (179 tests, 883 assertions)` |
| PHPStan | `vendor/bin/phpstan analyse --no-progress --memory-limit=1G` | 0 | PASS | `[OK] No errors` |
| Pint direcionado | `vendor/bin/pint --test -- <PHP do diff>` | 0 | PASS | `{"tool":"pint","result":"passed"}` |
| Pint global | `vendor/bin/pint --test` | 1 | FAIL preexistente | 17 arquivos fora do diff; nenhum arquivo desta continuação na lista |
| Build | `pnpm build` | 0 | PASS | Vite concluiu e sincronizou `public/assets`/`public/admin` |
| Preview | `pnpm build:preview` | 0 | PASS | `[preview] generated 19 pages` |
| Source of truth | `pnpm test:source` | 0 | PASS | artefatos admin/Laravel sincronizados |
| Node | `pnpm test` | 0 | PASS | `187 tests; 186 pass; 0 fail; 1 skipped` |
| Playwright stress paralelo | `npx.cmd playwright test --workers=4 --fully-parallel --reporter=line` | 1 | FAIL esperado/reproduzido | `Running 19 tests using 4 workers`; 19 falhas por `worker process exited unexpectedly`/`JavaScript heap out of memory`; 7.976 MB RAM física, pico dos processos novos 517 MB, pico 7 processos |
| Playwright browser final | `npx.cmd playwright test --reporter=line` | 0 | PASS | `Running 21 tests using 1 worker`; `21 passed (27.0s)` |
| Playwright regressões CodeRabbit | `npx.cmd playwright test tests/browser/admin.smoke.spec.js --reporter=line` | 0 | PASS | `6 passed (4.3s)` |
| Composer schema | PHAR oficial 8.2.35 `composer validate --strict --no-interaction` | 0 | PASS | `./composer.json is valid` |
| Composer audit | PHAR oficial `composer audit --locked --no-interaction --format=plain` | 0 | PASS | `No security vulnerability advisories found.` |
| pnpm audit | `pnpm audit --audit-level=high` | 0 | PASS | `No known vulnerabilities found` |
| Secret scan | `pnpm run security:secrets` | 0 | PASS | `Secret scan: PASS` |
| Sonda deploy | `bash -n`, ShellCheck oficial e `bash scripts/test-deploy-hostgator.sh` | 0 | PASS | cinco sondas OK; corpo inválido e TERM rejeitados; `deploy-hostgator probe tests: PASS` |
| Sonda deploy — ShellCheck | ShellCheck oficial temporário + `scripts/deploy-hostgator.sh scripts/test-deploy-hostgator.sh` | 0 | PASS | release `v0.11.0` baixada fora do repo, SHA-256 `8a4e...e740e` conferido; ShellCheck exit 0; `bash -n` e mock PASS |
| WAF documental | auditoria estática de campos/hostname/padding | 0 | PASS | `waf_mentions_padding=True`, `waf_mentions_primary_php=True`, expressão sem `body.size` |
| CORS proposto | parse JSON + regra de origens | 0 | PASS | `cors_proposed_tracked=True`, `cors_wildcard_local_preview_count=0`, origem do painel presente |
| Diff whitespace | `git diff --check` | 0 | PASS | somente avisos informativos de conversão LF/CRLF |
| Migração MySQL real | não executado | — | BLOCKED | sem banco de staging autorizado; nenhum banco real alterado |
| PHPUnit no merge HEAD | `vendor/bin/phpunit --testsuite=Feature --do-not-cache-result` com PHP 8.2.35 | 0 | PASS | `OK (179 tests, 883 assertions)` em `d784b2c` |
| Playwright serial no merge HEAD | `npx.cmd playwright test --reporter=line` | 0 | PASS | `Running 21 tests using 1 worker`; `21 passed (28.2s)` |
| Playwright 4 workers | `npx.cmd playwright test --workers=4 --fully-parallel --reporter=line` | 0 | PASS | `Running 21 tests using 4 workers`; `21 passed (11.9s)`; resultado não altera a configuração serial, que é o perfil reprodutível do host |
| Playwright 8 workers | `npx.cmd playwright test --workers=8 --fully-parallel --reporter=line` | 1 | FAIL reproduzido por pressão do host | `ERR_INSUFFICIENT_RESOURCES`, worker encerrado com `3221226505`, 8 falhas e 13 pass |
| Composer atual | PHAR oficial verificado por SHA-384 + PHP 8.2.35: `composer validate --strict --no-interaction` e `composer audit --locked --no-interaction --format=plain` | 0/0 | PASS | `./composer.json is valid`; `No security vulnerability advisories found.` |
| CodeQL remoto no HEAD final | workflow `CodeQL`, run `39833032792`, HEAD `955ba5d` | 0 | PASS | job `analyze` concluído com sucesso |
| CI remoto no HEAD final | `gh pr checks 27` / runs `39833032635`, `39833032648`, `39833032668` e `39833026662` | 8 | BLOCKED/PENDING | MySQL, quality/security, production package, CodeQL e Workers preview passaram; o job frontend do run `39833032648` permanece em `Install Chromium for browser smoke`, sem falha de teste reportada |

O primeiro `pnpm test` do baseline foi iniciado junto com a geração de preview
e falhou por manifesto ausente; a execução na ordem correta passou. Isso é
falha de orquestração local, não evidência de regressão do código.

## E. Infraestrutura e integrações

| Controle | Status | Limite |
|---|---|---|
| PHP 8.2.35 CLI | PASS | Binário oficial temporário fora do repo; não prova FPM |
| PHP-FPM HostGator | NOT VERIFIED | Sem SSH, painel, vhost ou pool remoto |
| HostGator/permissões/sessões | NOT VERIFIED | Checklist pronto, ambiente não identificado como staging |
| Cloudflare WAF | NOT VERIFIED | Documento corrigido; nenhuma regra consultada ou aplicada |
| R2 real | NOT VERIFIED | Sem bucket/objeto/credencial de staging autorizado |
| CORS efetivo | NOT VERIFIED | `cors.json` preservado; proposta não aplicada |
| OAuth externo | NOT VERIFIED | Sem client de teste e callback externo |
| Upload via navegador contra R2 | NOT VERIFIED | Browser local usa preview/fixtures |
| Playwright local | PASS com `workers: 1`; stress paralelo FAIL por OOM reproduzido | Configuração serial documentada; não é prova de R2/produção |
| AWS SDK / presign | PASS local | `composer.json` e lock fixam `^3.400.1`; R2 real NOT VERIFIED |
| Deploy | SKIPPED | Proibido executar; apenas gate/sintaxe/mock local |

## F. Banco, backup e rollback

- Integridade de aplicação e migrations foi exercitada pelos testes SQLite em
  memória; validação MySQL isolada com dados sintéticos ficou BLOCKED por falta
  de ambiente autorizado.
- Não foram executadas migrations destrutivas nem comandos em banco real.
- Backup e restauração real permanecem NOT VERIFIED; o procedimento exige dump,
  retenção, integridade e restore isolado antes de qualquer aprovação.
- O runbook em `docs/BACKUP-RECOVERY.md` cobre condição de interrupção, SHA
  anterior, compatibilidade de migrations, reversão, integridade pós-reversão,
  responsáveis e evidências.

## G. Segurança residual

Não foi confirmada vulnerabilidade Crítica ou Alta aberta no código. O risco
residual mais importante é operacional: um runtime PHP-FPM, bucket, WAF, CORS,
OAuth ou banco que divergir do contrato local só será detectado na homologação.
O upload R2 ainda precisa de validação real de Content-Type, `If-None-Match`,
expiração, falhas de rede, órfãos e concorrência em bucket de staging.

PHP 8.2.35 foi usado porque é o patch mínimo atual; planejar migração para
8.3/8.4 antes do fim do suporte de segurança da série 8.2.

O padding acima do limite do WAF permanece bypass esperado da inspeção de
body; a aprovação exige provar que o PHP-FPM de staging continua protegido
mesmo quando o WAF não enxerga o marcador deslocado. ShellCheck foi instalado
somente em diretório temporário fora do repositório, com SHA-256 oficial
verificado, e passou nos dois scripts.

## G.1 CodeRabbit — classificação independente

A revisão `COMMENTED` terminou no HEAD remoto anterior, com cinco comentários
acionáveis e um aviso de qualidade. A ausência de comentário não foi tratada
como aprovação.

| Comentário | Classificação | Prova técnica | Tratamento |
|---|---|---|---|
| `viewFromHash()` troca a view ativa quando o skip link usa `#admin-main` | VÁLIDO | Código retornava `dashboard-view` para qualquer hash sem link de view; fluxo podia esconder a view atual | Corrigido em `admin/main.js`; E2E cobre preservação da view e foco |
| `teamLoading` descarta refresh pedido durante mutação | VÁLIDO | `if (teamLoading) return` descartava a chamada; teste E2E reproduz a segunda solicitação pendente | Corrigido com `teamRefreshQueued`; E2E administrativo 6/6 PASS |
| foco de `dashboard-view` deve usar `#page-title` | VÁLIDO | `#page-title` fica fora do `section#dashboard-view`, então `querySelector('h1,h2,h3')` não encontrava heading | Corrigido; regressão browser PASS |
| floor de `aws/aws-sdk-php` abaixo do release testado | VÁLIDO | `R2PresignSignatureV4` depende dos hooks protegidos; `^3.0` não fixava a superfície testada, enquanto lock 3.400.1 passou o teste de headers assinados | Corrigido para `^3.400.1`; `composer validate`/audit e PHPUnit PASS |
| “fallback regex” para plano sem body inspection | VÁLIDO como correção documental | A variante ainda usava `http.request.body.raw`, que exige Enterprise e é truncável; não era fallback real | Seção removida e limites/plano/padding documentados |
| aviso de docstring coverage (11,27% vs 80%) | FORA DE ESCOPO | É métrica de qualidade do CodeRabbit, não falha de segurança/homologação confirmada; arquivos adicionais não devem ser reformatados oportunisticamente | Não alterado; propor PR de qualidade separada |

## H. GitHub e PR

- Repositório: `https://github.com/wandersongandra/mobiliaria-gisley-nunes.git`.
- Branch: `security/final-hardening-2026-10-22`; não é `main`.
- HEAD efetivo atual: `955ba5da98bba6ceacadd0a60a03a87bcdea57e6`, commit documental
  sobre o merge `d784b2c58bfc5bf4c26fa1f7f88d0be2ac0aefc9` e os ajustes de
  evidência `1761322`, cujos pais do merge são
  `2211386c3e9d4d7c2ddb83a40906f5493cb3ee66` e
  `51f6b1c399731f46c3ace603a695037f567a392a`;
  o commit `6f4169373d6d853c81a3e33723bcc5a253eac604` permanece somente como
  referência histórica. O merge-base com `main` é
  `6b476feaee5023cb0ee664f4edd16256e6055afe`.
- A PR estava `mergeable=false`/`CONFLICTING` antes da sincronização. O merge
  local 3-way encontrou conflitos somente em `admin/main.js`,
  `public/admin/main.js` e `tests/browser/admin.smoke.spec.js`; a resolução
  preservou o hardening da branch e incorporou o teste legítimo da `main`.
  O merge commit não mudou o conteúdo da árvore da PR; foi publicado por push
  normal e a PR passou a `MERGEABLE`.
- Commits atômicos desta continuação: `60264dc` (testes de autenticação/dados),
  `c53bcae` (estado/foco/refresh do admin), `6f2c7b3` (floor do AWS SDK) e
  `03361aa` (WAF, CORS, migração PHP e relatório), `4a135fc` (handoff do
  relatório), `d5ba552` (verificação ShellCheck), `113ecec` (sincronização do
  relatório), `919e050` (referências reproduzíveis da matriz) e `96d9859`
  (resposta 429 do rate limit).
- PR #27 permanece aberta e **DRAFT**. Não foi criada PR duplicada nem alterada
  a configuração do repositório.
- CodeRabbit terminou uma revisão `COMMENTED` no HEAD anterior; os cinco
  comentários acionáveis foram verificados e as cinco threads foram resolvidas
  após regressão no HEAD atual (quatro outdated e uma atual). O aviso de
  docstring foi classificado fora do escopo. O comando manual
  `@coderabbitai review` foi aceito, mas a própria automação informou que não
  reanalisa commits já revisados; o check remoto terminou como `pass` com
  revisão pulada por a PR continuar draft, e não é tratado como aprovação
  humana. A classificação completa está em G.1.
- No HEAD final `955ba5d`, CodeQL, Laravel CI/MySQL, quality/security,
  production package e Workers preview passaram. O job frontend correspondente
  ainda está pendente em `Install Chromium for browser smoke`; não há falha de
  teste reportada. CodeRabbit aparece como `pass` com a mensagem esperada de
  revisão pulada por a PR continuar draft.
- A API de proteção clássica de `main` respondeu `404 Branch not protected`, a
  listagem de rulesets acessível não retornou regras e a consulta de checks
  obrigatórios da branch respondeu que não há checks requeridos reportados.
  Isso é uma lacuna de governança do repositório, não uma justificativa para
  reduzir gates da PR.
- `cors.json` local continua preservado e não está nos commits.
- Não houve merge, deploy, rollback, alteração de produção, DNS, Cloudflare,
  R2, HostGator ou banco real.

## I. Checklist de homologação

Executar somente no staging identificado e aprovado, antes de liberar qualquer
gate:

1. **PHP-FPM/HostGator:** executar a sonda aleatória/cache-buster, confirmar
   SAPI `fpm-fcgi`, patch mínimo, upload progress desabilitado, `post_max_size`,
   headers `no-store`/JSON e remoção do arquivo em sucesso e falha.
2. **R2:** validar presigned PUT/GET em bucket de staging, MIME, Content-Type,
   `If-None-Match`, expiração, privacidade, falha de rede, substituição,
   exclusão e consistência com o banco sintético.
3. **CORS:** consultar o bucket de staging em modo leitura, comparar com
   `docs/cors.proposed.json`, confirmar o formato nativo `rules.allowed`,
   testar preflight permitido e origens/métodos/headers proibidos; não enviar
   PascalCase diretamente ao Wrangler/API nativa.
4. **WAF:** consultar a zone de staging, aplicar/validar a regra somente nela,
   medir falso positivo no upload legítimo, confirmar bloqueio do marcador e
   executar o caso de padding acima do limite do plano para registrar o
   truncamento/bypass sem relaxar o gate PHP-FPM.
5. **OAuth:** usar client/contas de teste, validar state uso único, replay,
   callback host/origem, timeout, erro do provedor e logout.
6. **Navegador:** executar o fluxo completo de upload/download/admin em desktop
   e mobile contra staging, incluindo cancelamento, reload e sessão expirada.
7. **Deploy/rollback:** executar preflight sem publicar, validar health,
   artefatos, `previous_sha`, backup/restore isolado e runbook de rollback.

Passos, placeholders, resultados esperados, aprovação/reprovação e rollback
estão em [`docs/homologacao-checklist.md`](../homologacao-checklist.md).

## J. Veredito

| Eixo | Resultado | Justificativa |
|---|---|---|
| Código | **READY WITH CONDITIONS** | Correções confirmadas, testes locais e checks remotos do HEAD verdes, nenhum CRITICAL/HIGH confirmado aberto; Pint global preexistente fora do escopo e CodeRabbit não equivale a aprovação humana |
| Homologação | **READY WITH CONDITIONS** | Checklist executável pronto, mas R2/HostGator/WAF/CORS/OAuth/MySQL ainda precisam de staging identificado |
| Produção | **BLOCKED** | Não existe evidência real de staging/produção nesta sessão; deploy e alterações reais são proibidos |

Fontes oficiais de versão e regras usadas na revisão: [PHP 8.2.35](https://www.php.net/releases/8_2_35.php), [versões suportadas do PHP](https://www.php.net/supported-versions.php), [Cloudflare `http.request.body.raw`](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.request.body.raw/) e [Cloudflare `http.cookie`](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.cookie/).
