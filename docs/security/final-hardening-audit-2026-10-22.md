# Auditoria final de hardening e homologação — 2026-10-22

## A. Resumo executivo

O checkout foi auditado na branch isolada `security/final-hardening-2026-10-22`. As alterações locais de hardening foram preservadas; o `cors.json` local permaneceu intocado e não faz parte desta entrega.

Os controles verificáveis localmente foram reforçados para: PHP2Shell, PHP mínimo, `session.upload_progress`, limite de `post_max_size`, validação de uploads R2, assinatura de headers, autorização de mídia, sessão, workflows e dependências. Também foi corrigido um gate que aceitava `APP_URL`/`ADMIN_ORIGIN` com caminho ou query como se fossem origens puras.

Parecer: **APROVAÇÃO CONDICIONAL para homologação**. O código e os testes locais estão prontos para os testes no ambiente apropriado, mas R2 real, CORS efetivo, PHP-FPM/HostGator, WAF, OAuth externo, fluxo real de upload no navegador e deploy continuam **NOT VERIFIED**. Isso impede qualquer parecer de produção.

PHP 8.2.35 foi confirmado como release de segurança oficial para a série 8.2; o suporte de segurança da série termina em 31/12/2026. O plano de migração para 8.3/8.4 deve ser tratado separadamente, sem migração nesta PR. Consulte [PHP 8.2.35](https://www.php.net/releases/8_2_35.php) e [supported versions](https://www.php.net/supported-versions.php).

## B. Vulnerabilidades e riscos

| Severidade | Localização | Causa/evidência | Exploração ou falha potencial | Correção | Situação |
|---|---|---|---|---|---|
| HIGH residual de ambiente | PHP-FPM/HostGator; `scripts/deploy-hostgator.sh` | PHP CLI local era 8.2.29; FPM real não foi acessado | Release servido por FPM abaixo do patch mínimo pode permanecer exposto ao vetor PHP2Shell | Gate fail-closed com probe HTTP de FPM, PHP mínimo no Composer/CI e `.user.ini` versionado | **NOT VERIFIED** externamente; gate local/sintaxe **PASS** |
| MEDIUM corrigido | `app/Console/Commands/ProductionCheck.php` e `tests/Feature/ProductionCheckCommandTest.php` | O parser original ignorava caminho/query/fragmento/credenciais em URLs de origem; teste negativo falhou antes da correção | Configuração inválida poderia passar no preflight e contaminar redirects/URLs geradas | Parser agora aceita apenas origem HTTP(S), host, porta válida e barra final opcional; teste de regressão passa | **CONFIRMED → CORRIGIDO; PASS** |
| MEDIUM operacional | `cors.json` local versus `docs/cloudflare-r2-admin.md` | Arquivo local não rastreado usa objeto `rules/allowed`; a documentação exige array e chaves PascalCase | CORS pode não ser aplicado ou pode permitir teste divergente do contrato documentado | Criado `docs/cors.proposed.json`; o arquivo original foi preservado e excluído da PR | **NOT VERIFIED** no bucket; proposta pronta |
| HIGH residual de integração | R2 real e ciclo navegador → R2 → banco | Credenciais, bucket e endpoint real não foram acessados | MIME/headers/CORS/privacidade podem divergir do comportamento dos mocks | Validações locais, magic bytes, dimensões, pixels, objeto privado, `If-None-Match` e compensação de falha | **PASS** local; R2 real **NOT VERIFIED** |
| LOW preexistente | Pint global | Baseline limpo já falhava em arquivos não relacionados; a execução atual lista os mesmos arquivos fora do escopo | Apenas divergência de estilo; não é vulnerabilidade | Pint direcionado dos arquivos tocados passou; nenhuma reformatacão oportunista | **FAIL preexistente**, sem regressão introduzida |

Vetor PHP2Shell em até três linhas: uma requisição multipart maliciosa alcança o processamento de upload/progresso da sessão antes do fluxo normal da aplicação; versões vulneráveis podem sofrer corrupção, execução ou exaustão de memória conforme o advisory. O controle correto é atualizar o runtime e provar o PHP-FPM efetivo, além de desabilitar upload progress e limitar o corpo.

## C. Implementações

- CI, preflight e build de produção passaram a exigir PHP 8.2.35 com action e cache fixados por SHA; CodeQL ganhou concorrência cancelável.
- `composer.json` e `composer.lock` passaram a declarar PHP `>=8.2.35`.
- `ProductionCheck` agora falha fechado para branches PHP desconhecidas, valida patch mínimo, `.user.ini`, upload progress, `post_max_size`, cookies e origens estritas.
- O deploy HostGator passou a sondar o PHP-FPM por HTTP em cinco tentativas, abortando em qualquer resposta insegura e removendo o probe efêmero via `trap`.
- O upload R2 agora usa chaves imutáveis, `Content-Type` e `If-None-Match` assinados, validação de magic bytes, MIME real, dimensões, pixels, memória, tamanho, conteúdo e compensação de falha antes do registro no banco.
- A leitura de mídia usa URL pré-assinada curta, `ResponseContent-Type` validado e `Content-Disposition` inline com nome sanitizado.
- Foram reforçados testes de sessão/revogação, upload, assinatura e gate de origem.
- Criados [`docs/cors.proposed.json`](../cors.proposed.json) e [`docs/homologacao-checklist.md`](../homologacao-checklist.md).
- O rascunho de regra WAF em `docs/security/cloudflare-waf-php2shell.txt` foi marcado explicitamente como não aplicado.

### Diferenças de CORS

| Campo | `cors.json` local preservado | Proposta/documentação | Justificativa e impacto |
|---|---|---|---|
| Estrutura raiz | Objeto com `rules` | Array de regras | Alinha ao formato documentado e ao comando de configuração; evita rejeição silenciosa |
| Origem | `allowed.origins` | `AllowedOrigins` | Mantém somente o painel HTTPS autorizado, sem wildcard |
| Método | `allowed.methods` com `PUT` | `AllowedMethods` com `PUT` | Mantém o mínimo necessário para upload |
| Headers | `allowed.headers` com `Content-Type`, `If-None-Match` | `AllowedHeaders` com os mesmos dois | Permite somente os headers que entram no contrato assinado |
| Exposição | `exposeHeaders` com `ETag` | `ExposeHeaders` com `ETag` | Permite confirmação de integridade sem expor headers extras |
| Cache de preflight | `maxAgeSeconds: 3600` | `MaxAgeSeconds: 3600` | Mantém o comportamento documentado |

## D. Testes e evidências

Todos os comandos abaixo foram executados nesta sessão. `PASS` significa exit code 0; `FAIL` significa execução com reprovação; `BLOCKED` significa impedimento de execução; `NOT VERIFIED` significa ausência de acesso ao controle externo.

| Teste | Comando | Status | Evidência |
|---|---|---|---|
| PHPUnit no PHP oficial | `php 8.2.35 -d memory_limit=512M vendor/phpunit/phpunit/phpunit --testsuite=Feature --do-not-cache-result` | PASS | `OK (168 tests, 816 assertions)`; exit 0 |
| PHPUnit sem limite CI | Mesmo comando sem `memory_limit=512M` | FAIL ambiental | O teste de 10.000 registros recebeu `SQLSTATE ... out of memory`; repetição com o limite usado no CI passou |
| Node | `pnpm test` | PASS | `187 tests, 186 pass, 0 fail, 1 skipped` |
| Artefatos | `pnpm build` | PASS | Vite concluiu; assets sincronizados |
| Fonte/artifacts | `pnpm test:source` | PASS | `admin and Laravel public artifacts are synchronized` |
| Browser preview | `pnpm test:browser` | PASS | `19 passed (24.1s)`; Chromium local instalado no cache |
| PHPStan | `vendor/bin/phpstan analyse --memory-limit=1G` com PHP 8.2.35 | PASS | `[OK] No errors` |
| Pint direcionado | `vendor/bin/pint --test` nos 7 arquivos PHP alterados/testes | PASS | `{"tool":"pint","result":"passed"}` |
| Pint global | `vendor/bin/pint --test` | FAIL preexistente | Lista somente arquivos fora do conjunto alterado; baseline limpo já falhava |
| Composer schema | `composer validate --strict --no-interaction` | PASS | `./composer.json is valid`; exit 0 |
| Composer advisories | `composer audit --locked --no-interaction` | PASS | `No security vulnerability advisories found.` |
| Node advisories | `pnpm audit --audit-level=high` | PASS | `No known vulnerabilities found` |
| Secret scan | `pnpm security:secrets` | PASS | `Secret scan: PASS` |
| Deploy syntax | `bash -n scripts/deploy-hostgator.sh` | PASS | exit 0 |
| Deploy fail-closed | `bash scripts/deploy-hostgator.sh` sem `ALLOW_HOSTGATOR_DEPLOY=1` | PASS | abortou antes de tocar alvo, exit 1 |
| Diff whitespace | `git diff --check` | PASS | exit 0; apenas avisos de conversão LF/CRLF do Git |
| Gate de origem antes da correção | teste negativo de `ProductionCheckCommandTest` | FAIL esperado | Configuração com caminho/query passou além do esperado |
| Gate de origem após a correção | mesmo teste negativo | PASS | `OK (1 test, 2 assertions)`; exit 0 |

Baseline limpo em worktree separado: build preview PASS; Node PASS após gerar o preview (`187/186/0/1`); source-of-truth PASS após build; PHPStan PASS; PHPUnit teve `155 tests, 795 assertions` e uma falha ambiental por configuração de sessão ausente; Pint global FAIL em divergências preexistentes. Nenhuma dessas verificações foi feita descartando o worktree local.

## E. Infraestrutura e integrações

| Controle | Status | Limite da evidência |
|---|---|---|
| HostGator | NOT VERIFIED | Nenhum SSH/SFTP, painel ou filesystem remoto foi acessado |
| PHP-FPM efetivo | NOT VERIFIED | PHP 8.2.35 foi verificado no CLI temporário; o FPM real ainda precisa da sonda do deploy |
| Cloudflare WAF | NOT VERIFIED | Existe apenas rascunho de regra; nenhuma regra foi aplicada ou consultada |
| R2 real | NOT VERIFIED | Cliente, bucket, CORS e objeto real não foram acessados |
| CORS efetivo | NOT VERIFIED | `docs/cors.proposed.json` foi criado, mas não aplicado |
| OAuth externo | NOT VERIFIED | Não houve login/callback contra Google ou produção |
| Upload via browser contra R2 | NOT VERIFIED | Browser local passou contra preview; não prova R2, CORS ou HostGator |
| Deploy | SKIPPED | Proibido pelo escopo desta sessão; somente sintaxe e fail-closed local foram exercitados |

## F. Git e PR

- Repositório: `https://github.com/wandersongandra/mobiliaria-gisley-nunes.git`.
- Branch: `security/final-hardening-2026-10-22`, criada a partir do HEAD `f9e30eb`.
- O `cors.json` permaneceu local, não rastreado e fora do staging/PR.
- Alterações tracked e untracked preexistentes foram preservadas; não foram usados `stash`, `reset`, `clean`, `checkout .`, `restore` em massa ou `git add .`.
- Commit, push e número da PR serão registrados após a revisão do staging. Merge e deploy permanecem proibidos.

## G. Pendências

1. Executar o [`checklist de homologação`](../homologacao-checklist.md) em ambiente isolado.
2. Confirmar PHP-FPM real em patch corrigido, `.user.ini` efetivo e permissões HostGator.
3. Validar CORS efetivo com preflight permitido e negado; aplicar somente após autorização no bucket de homologação.
4. Validar R2 privado, URLs temporárias, headers, corrida de sobrescrita, órfãos e consistência com o banco.
5. Consultar/aplicar a regra WAF somente no escopo autorizado e comprovar eventos.
6. Executar OAuth externo com contas de teste e replay de `state` rejeitado.
7. Depois da homologação, atualizar o plano de migração de PHP 8.2 para 8.3/8.4 antes do fim do suporte de segurança de 8.2.

## H. Parecer técnico

**APROVAÇÃO CONDICIONAL — alterações prontas para homologação.**

Não há vulnerabilidade Crítica confirmada aberta no código revisado e os gates locais relevantes passaram. A aprovação é condicional porque os controles que dependem de R2, CORS efetivo, PHP-FPM/HostGator, WAF, OAuth externo e deploy não são demonstráveis localmente. **Não aprovado para produção** e nenhuma operação de produção foi executada.
