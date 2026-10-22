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

O código está **READY WITH CONDITIONS** para homologação. Não há CRITICAL ou
HIGH de código confirmado aberto nesta revisão. PHP-FPM/HostGator, R2 real,
CORS efetivo, WAF, OAuth externo, banco de staging e upload real continuam sem
prova externa. Logo, produção permanece **BLOCKED**.

PHP 8.2.35 existe e foi usado nesta sessão por binário oficial temporário; a
série 8.2 recebe correções de segurança até 2026-12-31. Planejar migração para
8.3/8.4 em PR separada, sem migrar nesta.

## B. Vulnerabilidades e riscos

| Severidade | Localização | Causa raiz | Evidência | Impacto | Correção | Situação |
|---|---|---|---|---|---|---|
| MEDIUM | `scripts/deploy-hostgator.sh` | Sonda com arquivo previsível, limpeza incompleta, resposta pouco validada e token em header de argumento | Prova estática pré-correção encontrou `secure-temp-file`, `signal-cleanup` e `probe-cache-hardening` ausentes; teste mock pós-correção cobriu sucesso, corpo inválido e TERM | Deploy poderia validar cache/worker errado, deixar diagnóstico público ou expor token no process list | `mktemp`, CSPRNG, config temporário do curl, `umask 077`, headers/body separados, cache-buster, validação de JSON/SAPI/headers e traps HUP/INT/TERM/EXIT | CONFIRMED → CORRIGIDO; PASS |
| MEDIUM | `docs/security/cloudflare-waf-php2shell.txt` | Uso de `http.request.body` e comparação de mapa de cookies com `contains` | Campos foram comparados com a referência oficial do Ruleset Engine; auditoria estática pós-correção não encontrou os campos inválidos nem hostname de produção | Regra poderia não compilar ou aparentar cobertura sem bloquear | Expressão com `http.request.body.raw`, `http.cookie`, limites/plano documentados e escopo somente staging | CONFIRMED → CORRIGIDO; PASS |
| MEDIUM | `app/Services/R2Storage.php` | `ResponseContent-Type` não era o nome do parâmetro SDK e cache de GET não era fixado | Teste falhou: `response-content-type` ausente; após `ResponseContentType` + `ResponseCacheControl`, 24 testes passaram | Navegador poderia receber tipo diferente do esperado e mídia administrativa poderia ser reutilizada por cache | Parâmetros SDK corretos, allowlist de cache público curto/privado sem cache e admin usando `private, no-store` | CONFIRMED → CORRIGIDO; PASS |
| HIGH residual | HostGator/PHP-FPM | Runtime web real não foi acessado | CLI 8.2.35 passou; FPM remoto não foi sondado | FPM abaixo do patch mínimo pode manter exposição ao PHP2Shell | Gate fail-closed e roteiro de staging | NOT VERIFIED; sem confirmação remota |
| MEDIUM residual | R2/CORS/OAuth/WAF efetivos | Integrações externas não disponíveis/permitidas nesta sessão | Nenhum bucket, zone, client OAuth ou domínio de staging autorizado foi identificado | Configuração efetiva pode divergir da proposta local | Checklist executável de homologação | NOT VERIFIED |
| LOW | Pint global | Divergências de estilo em 19 arquivos fora do diff desta tarefa | Global exit 1; baseline limpo reportou o mesmo conjunto; nenhum arquivo tocado nesta sessão está na lista | Ruído de qualidade, sem evidência de falha de segurança | PR de estilo separada; não reformatado aqui | FAIL preexistente/fora do escopo |

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
| PHPUnit final | `vendor/bin/phpunit --testsuite=Feature --do-not-cache-result` com PHP 8.2.35 | 0 | PASS | `OK (172 tests, 831 assertions)` |
| PHPStan | `vendor/bin/phpstan analyse --no-progress --memory-limit=1G` | 0 | PASS | `[OK] No errors` |
| Pint direcionado | `vendor/bin/pint --test -- <PHP do diff>` | 0 | PASS | `{"tool":"pint","result":"passed"}` |
| Pint global | `vendor/bin/pint --test` | 1 | FAIL preexistente | 19 arquivos fora do diff; baseline reportou o mesmo conjunto |
| Build | `pnpm build` | 0 | PASS | Vite concluiu e sincronizou `public/assets`/`public/admin` |
| Preview | `pnpm build:preview` | 0 | PASS | `[preview] generated 19 pages` |
| Source of truth | `pnpm test:source` | 0 | PASS | artefatos admin/Laravel sincronizados |
| Node | `pnpm test` | 0 | PASS | `187 tests; 186 pass; 0 fail; 1 skipped` |
| Playwright paralelo | `pnpm exec playwright test --workers=2` | 0 | PASS | `19 passed (25.2s)` |
| Playwright serial | `pnpm exec playwright test --workers=1` | 0 | PASS | `19 passed (24.5s)`; OOM não reproduzido |
| Composer schema | PHAR oficial 8.2.35 `composer validate --strict --no-interaction` | 0 | PASS | `./composer.json is valid` |
| Composer audit | PHAR oficial `composer audit --locked --no-interaction --format=plain` | 0 | PASS | `No security vulnerability advisories found.` |
| pnpm audit | `pnpm audit --audit-level=high` | 0 | PASS | `No known vulnerabilities found` |
| Secret scan | `pnpm run security:secrets` | 0 | PASS | `Secret scan: PASS` |
| Sonda deploy | `bash -n`, ShellCheck oficial e `bash scripts/test-deploy-hostgator.sh` | 0 | PASS | cinco sondas OK; corpo inválido e TERM rejeitados; `deploy-hostgator probe tests: PASS` |
| WAF documental | auditoria estática de campos/hostname | 0 | PASS | sem campo inválido e sem domínio de produção |
| Diff whitespace | `git diff --check` | 0 | PASS | somente avisos informativos de conversão LF/CRLF |
| Migração MySQL real | não executado | — | BLOCKED | sem banco de staging autorizado; nenhum banco real alterado |

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

## H. GitHub e PR

- Repositório: `https://github.com/wandersongandra/mobiliaria-gisley-nunes.git`.
- Branch: `security/final-hardening-2026-10-22`; não é `main`.
- HEAD de referência inicial local/remoto: `6f4169373d6d853c81a3e33723bcc5a253eac604`.
- Commits desta sessão: `0b92354` (código/gates/testes) e `501be40`
  (WAF, homologação e rollback), seguidos do commit documental deste relatório.
- PR #27 permanece aberta e **DRAFT**. Não foi criada PR duplicada nem alterada
  a configuração do repositório.
- CodeRabbit não revisa automaticamente PR draft; a ausência de revisão não é
  aprovação de segurança. A tentativa de comentário, se disponível, será
  registrada separadamente.
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
   `docs/cors.proposed.json`, testar preflight permitido e origens/métodos/
   headers proibidos.
4. **WAF:** consultar a zone de staging, aplicar/validar a regra somente nela,
   medir falso positivo no upload legítimo e confirmar bloqueio do marcador.
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
| Código | **READY WITH CONDITIONS** | Correções confirmadas, testes locais verdes e nenhum CRITICAL/HIGH confirmado aberto; Pint global preexistente fora do escopo |
| Homologação | **READY WITH CONDITIONS** | Checklist executável pronto, mas R2/HostGator/WAF/CORS/OAuth/MySQL ainda precisam de staging identificado |
| Produção | **BLOCKED** | Não existe evidência real de staging/produção nesta sessão; deploy e alterações reais são proibidos |

Fontes oficiais de versão e regras usadas na revisão: [PHP 8.2.35](https://www.php.net/releases/8_2_35.php), [versões suportadas do PHP](https://www.php.net/supported-versions.php), [Cloudflare `http.request.body.raw`](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.request.body.raw/) e [Cloudflare `http.cookie`](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/http.cookie/).
