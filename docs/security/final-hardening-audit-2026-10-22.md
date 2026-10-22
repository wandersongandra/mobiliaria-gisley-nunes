# Auditoria final de hardening e homologação — 2026-10-22

## A. Resumo executivo

Auditoria executada na branch isolada `security/final-hardening-2026-10-22`, sem merge, deploy, alteração de produção, alteração de DNS, aplicação de CORS ou acesso a R2/HostGator.

O baseline limpo foi mantido em worktree separado para reproduzir os achados. Foram confirmados e corrigidos dois problemas de segurança/homologação:

1. `AuthController::callback` aceitava parâmetros OAuth estruturais em array e convertia o valor para string, produzindo erro 500 antes da rejeição do callback.
2. `RequireAdminOrigin` validava somente o host e aceitava esquema ou porta divergentes da origem administrativa configurada.

Os testes de regressão falham no baseline e passam após a correção. Os gates locais finais passaram com PHP oficial temporário 8.2.35, exceto o Pint global, que continua reprovando somente arquivos fora do escopo desta alteração. O browser local passa com um worker; a execução paralela encontrou esgotamento de memória do worker Chromium.

Parecer: **APROVAÇÃO CONDICIONAL para homologação**. Não há vulnerabilidade Crítica ou Alta confirmada aberta no código revisado. R2 real, CORS efetivo, PHP-FPM/HostGator, WAF, OAuth externo, upload real no navegador e deploy continuam **NOT VERIFIED**. Portanto, esta branch não está aprovada para produção.

PHP 8.2.35 existe e foi verificado nesta sessão como release oficial de 2026-10-21 ([release](https://www.php.net/releases/8_2_35.php)). A série 8.2 tem suporte de segurança até 2026-12-31 ([supported versions](https://www.php.net/supported-versions.php)); a migração para 8.3/8.4 deve ser planejada separadamente.

## B. Vulnerabilidades e riscos

| Severidade | Localização | Causa/evidência | Exploração ou falha potencial | Correção | Situação |
|---|---|---|---|---|---|
| MEDIUM | `app/Http/Controllers/AuthController.php:callback` | Baseline: parâmetro `code[]=...` causou `Array to string conversion` e HTTP 500; teste focado falhou | Entrada estruturada malformada alcançava conversão e erro interno; pode gerar ruído/DoS de baixo impacto e contrato HTTP incorreto | Aceitar somente valores escalares string antes da validação e impedir chamada externa; regressão confirma zero requests OAuth | **CONFIRMED → CORRIGIDO; PASS** |
| MEDIUM | `app/Http/Middleware/RequireAdminOrigin.php` | Baseline: esquema/porta divergentes no mesmo host retornaram 200 em vez de 307; teste focado falhou | Um endpoint administrativo poderia ser aceito em origem diferente da origem canônica configurada | Comparação exata de esquema, host e porta após canonicalização estrita; regressão cobre HTTP e porta incorreta | **CONFIRMED → CORRIGIDO; PASS** |
| HIGH residual de ambiente | PHP-FPM/HostGator; `scripts/deploy-hostgator.sh` | CLI padrão local 8.2.29; FPM real não foi acessado | Release servido por FPM abaixo do patch mínimo pode permanecer exposto ao vetor PHP2Shell | Gate fail-closed com sonda HTTP, checagem de PHP e `.user.ini`; validação remota ainda necessária | **NOT VERIFIED**, não confirmado no ambiente remoto |
| MEDIUM operacional | `cors.json` local e `docs/cloudflare-r2-admin.md` | Arquivo não rastreado local usa estrutura diferente da proposta documentada | CORS pode não ser aplicado ou pode divergir do contrato do upload | `docs/cors.proposed.json` é a proposta rastreável; `cors.json` original foi preservado e excluído da PR | **NOT VERIFIED** no bucket |
| LOW | Pint global | Execução final reprova somente arquivos fora do diff desta tarefa | Divergência de estilo, sem evidência de vulnerabilidade | Pint direcionado dos arquivos tocados passou; nenhum arquivo não relacionado foi reformatado | **FAIL preexistente/fora do escopo** |

Vetor PHP2Shell em até três linhas: uma requisição multipart maliciosa pode alcançar o processamento de upload/progresso da sessão antes do fluxo normal da aplicação; versões vulneráveis podem permitir corrupção, execução ou exaustão de memória conforme o advisory. A mitigação exige runtime corrigido, PHP-FPM efetivo verificado, upload progress desabilitado e limites de corpo.

## C. Implementações

Alterações desta sessão:

- `AuthController::callback` passou a rejeitar valores não escalares para `code`, `state` e state salvo em sessão antes de qualquer troca OAuth.
- `RequireAdminOrigin` passou a exigir origem canônica com esquema HTTP(S), host, porta válida, sem path/query/fragmento/credenciais, e a comparar a origem completa com `getSchemeAndHttpHost()`.
- Adicionado teste de regressão para parâmetros OAuth em array e ausência de chamada HTTP externa.
- Adicionado teste de regressão para esquema e portas divergentes da origem administrativa.
- Corrigido `docs/homologacao-checklist.md` para usar cookie de sessão, rota OAuth real, header de probe FPM real e variáveis efetivas do script de deploy.
- Atualizado o status do checklist para distinguir PHP CLI temporário 8.2.35 de PHP-FPM/HostGator não verificado.
- `docs/cors.proposed.json` foi validado e permaneceu sem alteração; `cors.json` não rastreado permaneceu fora da PR.

Hardening preexistente da branch, revalidado sem reiniciar trabalho: PHP2Shell/PHP mínimo, `.user.ini`, upload R2 com magic bytes/MIME/dimensões/pixels/memória, URLs assinadas e headers, autorização de mídia, sessão/revogação, CSP/headers, Actions fixadas por SHA, dependências e deploy fail-closed.

### Proposta de CORS

| Campo | `cors.json` local preservado | `docs/cors.proposed.json` | Justificativa |
|---|---|---|---|
| Estrutura | Objeto com `rules`/`allowed` | Array de regra com chaves PascalCase | Alinha ao formato documentado para configuração R2 |
| Origem | Painel HTTPS | Painel HTTPS | Sem wildcard; menor escopo |
| Método | `PUT` | `PUT` | Mínimo necessário para upload |
| Headers | `Content-Type`, `If-None-Match` | Os mesmos | Mantém o contrato assinado |
| Exposição | `ETag` | `ETag` | Confirma integridade sem expor headers extras |
| Cache | `3600` | `3600` | Mantém o valor documentado |

## D. Testes e evidências

Todos os resultados abaixo foram obtidos nesta sessão. `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` e `SKIPPED` seguem o vocabulário desta auditoria.

| Teste | Comando/resumo | Status | Evidência |
|---|---|---|---|
| Regressão no baseline | PHPUnit focado no worktree limpo | FAIL esperado | `21 tests, 83 assertions, 2 failures`, exit 1: baseline retornou 200 para origem divergente e 500 para array OAuth |
| Regressão corrigida | PHPUnit focado `OAuthIdentityTest|HttpSecurityBoundaryTest` | PASS | `OK (21 tests, 90 assertions)`, exit 0 |
| PHPUnit completo | PHP 8.2.35 oficial, `--testsuite=Feature`, `memory_limit=1G` | PASS | `OK (170 tests, 826 assertions)`, exit 0 |
| PHPUnit paralelo inicial | Mesmo conjunto sob concorrência com outros gates | FAIL ambiental | SQLite `out of memory` em teste de 10.000 registros; repetição isolada passou |
| Node | `pnpm test` | PASS | `187 tests; 186 pass; 0 fail; 1 skipped` |
| Build | `pnpm build` | PASS | Vite concluiu e sincronizou `public/assets`/`public/admin` |
| Source of truth | `pnpm test:source` | PASS | Artefatos admin/Laravel sincronizados |
| Browser | `pnpm exec playwright test --workers=1` | PASS | `19 passed (28.6s)`; execução com 2 workers falhou por OOM do worker, sem relaxar testes |
| PHPStan | `vendor/bin/phpstan analyse --no-progress --memory-limit=1G` | PASS | `[OK] No errors` |
| Pint direcionado | `vendor/bin/pint --test` nos PHP tocados e hardening relacionado | PASS | `{"tool":"pint","result":"passed"}` |
| Pint global | `vendor/bin/pint --test` | FAIL fora do escopo | Lista 19 arquivos não tocados; nenhum arquivo do diff final aparece na lista |
| Composer schema | `composer validate --strict --no-interaction` | PASS | `./composer.json is valid`, exit 0 |
| Composer advisories | `composer audit --locked --no-interaction` | PASS | `No security vulnerability advisories found.`, exit 0 |
| Node advisories | `pnpm audit --audit-level=high` | PASS | `No known vulnerabilities found` |
| Secret scan | `pnpm security:secrets` | PASS | `Secret scan: PASS` |
| Deploy syntax | `bash -n scripts/deploy-hostgator.sh` | PASS | Bash 5.3.9, exit 0 |
| Deploy fail-closed | `bash scripts/deploy-hostgator.sh` sem `ALLOW_HOSTGATOR_DEPLOY=1` | PASS | Script abortou com mensagem de execução desabilitada; child exit 1, cenário esperado |
| Whitespace | `git diff --check` | PASS | Exit 0; apenas avisos informativos de LF/CRLF do Git |

## E. Infraestrutura e integrações

| Controle | Status | Limite da evidência |
|---|---|---|
| HostGator | NOT VERIFIED | Nenhum SSH, SFTP, painel ou filesystem remoto acessado |
| PHP-FPM efetivo | NOT VERIFIED | PHP 8.2.35 foi verificado no CLI temporário; FPM real não foi sondado |
| Cloudflare WAF | NOT VERIFIED | Rascunho de regra existe; nenhuma regra foi consultada/aplicada |
| R2 real | NOT VERIFIED | Bucket, objeto, credencial e endpoint real não foram acessados |
| CORS efetivo | NOT VERIFIED | Proposta validada localmente, não aplicada |
| OAuth externo | NOT VERIFIED | Nenhum login/callback contra provedor externo ou produção |
| Upload via navegador contra R2 | NOT VERIFIED | Browser local usou preview/mocks; não prova CORS/R2/HostGator |
| Deploy | SKIPPED | Proibido pelo escopo; somente sintaxe e abort fail-closed local foram exercitados |

## F. Git e PR

- Repositório: `https://github.com/wandersongandra/mobiliaria-gisley-nunes.git`.
- Branch de trabalho: `security/final-hardening-2026-10-22`; não é `main`.
- O HEAD observado no início da edição foi `30b6fab872f33d11a46abb7a1b4125813a81b327`; esse avanço concorrente já existia e não foi descartado.
- Worktree baseline separado foi criado e devolvido limpo; nenhum stash, reset, clean, checkout/restore em massa ou `git add .` foi usado.
- `cors.json` continua não rastreado, preexistente, preservado e fora do staging/PR.
- Commits desta sessão: `b2e49b6` (`fix(security): harden OAuth input and admin origin`) e `38a5fbc` (`docs(security): record final homologation evidence`).
- Commit de handoff: `c919eda` (`docs(security): record commit handoff`).
- Push: **PASS**, branch remota atualizada até `c919eda66340c11f447e3c4d64aeb22e5733359b`.
- PR draft: **#27**, [security: final hardening and homologation gates](https://github.com/wandersongandra/mobiliaria-gisley-nunes/pull/27), estado `OPEN`/`DRAFT`.
- Checks remotos observados para o SHA publicado: `analyze`, `frontend`, `mysql`, `production-build`, `quality`, `security`, `CodeQL` e `Workers Builds` em **PASS**. `CodeRabbit` ficou **SKIPPED** porque a PR é draft.
- Merge e deploy continuam proibidos; o check Workers Builds foi um preview automático da integração e não foi promovido por esta sessão.

## G. Pendências

1. Executar o [`docs/homologacao-checklist.md`](../homologacao-checklist.md) somente em staging isolado.
2. Confirmar PHP-FPM real, `.user.ini` efetivo, permissões e exposição de arquivos no HostGator.
3. Validar CORS efetivo e ciclo completo R2 com preflight permitido/negado, headers, privacidade, corrida, órfãos e consistência banco/R2.
4. Consultar a regra WAF no escopo de homologação e comprovar eventos sem alterar produção.
5. Executar OAuth externo com contas de teste, replay de state, host divergente e logout.
6. Executar upload real pelo navegador contra R2 e verificar perda de rede/cancelamento/substituição.
7. Planejar migração da série PHP 8.2 para 8.3/8.4 antes do fim do suporte de segurança em 31/12/2026.

## H. Parecer técnico

**APROVAÇÃO CONDICIONAL — alterações prontas para homologação.**

Os dois achados confirmados nesta sessão têm regressões reproduzíveis e corrigidas. Os gates locais relevantes passaram com evidência real. A aprovação é condicional porque os controles dependentes de R2, CORS efetivo, PHP-FPM/HostGator, WAF, OAuth externo e deploy ainda não podem ser provados neste checkout. **Não aprovado para produção.**
