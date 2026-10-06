# Fase 4 — Runtime HostGator

Data da verificação inicial: 2026-10-03. Atualização operacional: 2026-10-05.

Esta fase foi executada sem alteração de DNS externo e sem expor qualquer
segredo. A migration foi aplicada somente na base dedicada do HostGator após
autorização explícita.

Atualização da continuação em 2026-10-05: sem alterar DNS ou runtime, uma sonda
externa somente leitura confirmou `gisleynunesimoveis.com.br`, `www` e `painel`
resolvendo para `192.185.213.23`. `curl` sem `-k` retornou `HTTP 200`, `ssl=0` e
`{"status":"ok"}` nos health checks executados. As classificações históricas
`BLOCKED` abaixo permanecem como snapshot da fase inicial; não foram usados para
provar que o SHA público atual é o mesmo do checkout local.

## Resultado resumido

| Controle | Estado | Evidência |
| --- | --- | --- |
| HostGator SSH | PASS | Chave `gisley_hostgator_deploy` autenticou no host `192.185.213.23:2222`. |
| PHP CLI HostGator | PASS | PHP `8.3.35`, CLI, OPcache 8.3.35 e ionCube carregados. |
| PHP web / PHP-FPM | BLOCKED | Os domínios foram cadastrados no cPanel, mas o DNS público ainda aponta para o provedor antigo. |
| Extensões HostGator | PASS | pdo, pdo_mysql, openssl, mbstring, fileinfo, json, ctype, tokenizer e curl disponíveis. |
| Composer HostGator | PASS | `~/bin/composer` 2.10.3 e instalação `--no-dev` já confirmadas. |
| Laravel boot HostGator | PASS | `artisan` iniciou no checkout e `db:show` conectou à base dedicada. |
| `app:production-check` HostGator | FAIL | Todos os controles locais passaram; R2 e OAuth permanecem ausentes por dependerem de secrets externos. |
| Storage e permissões | PASS | Diretórios graváveis, sem `777`; probe temporário de escrita/remoção passou. |
| Apache / PHP-FPM | BLOCKED | `.htaccess` foi auditado estaticamente; handler web efetivo ainda não pode ser testado. |
| Document Root | PASS (configuração) | `gisleynunesimoveis.com.br` e `painel.gisleynunesimoveis.com.br` apontam no cPanel para `/home1/gisley77/repositories/mobiliaria-gisley-nunes/public`. |
| MySQL HostGator | PASS | Conexão Laravel confirmada; MySQL `5.7.44-48`, base dedicada migrada. |
| Compatibilidade de migrations | PASS | As nove migrations foram aplicadas com sucesso no MySQL 5.7.44 e `migrate:status` confirmou todas como `Ran`. |
| Health live/ready | BLOCKED | Os URLs públicos retornaram `302` do site antigo para `/`, não o JSON Laravel esperado. |
| Cloudflare trusted proxy | PASS (configuração) | Ranges oficiais explícitos foram gravados no `.env`; tráfego Cloudflare real ainda não foi exercitado. |
| R2 real | BLOCKED | Não há credenciais autorizadas de bucket de teste. |
| OAuth real | BLOCKED | Não há provedor/callback de teste autorizado. |
| Infraestrutura automatizada | PASS (preparação) | Script SHA-locked e workflow gated com `StrictHostKeyChecking=yes` foram versionados; habilitação continua desligada. |
| Deploy público | NOT EXECUTED | Explicitamente não executado. |

## Evidência local confirmada

- Branch: `migration/laravel-backend-2026-10-02`.
- SHA inicial da fase: `3b78b474c2c6d8199697bc132939ac93fd61af4b`.
- SHA atual validado no checkout local, no `origin` e na HostGator:
  `1db7ee6c83237bf9692804fb916e6f076d39300f`.
- O repositório contém a estrutura Laravel esperada e `composer.lock`.
- `composer.json` requer PHP `^8.2`, Laravel 12 e `pdo_mysql` é exigido pelo
  `app:production-check`.
- CI remoto já confirmou MySQL 8.4, migrations do zero, rollback, pacote sem
  dependências de desenvolvimento e caches Laravel.
- O `public/.htaccess` contém `Options -Indexes`, `RewriteEngine` e encaminha
  somente requisições que não sejam arquivos/diretórios para `public/index.php`.
- `/health/live` não acessa banco e `/health/ready` responde `503` sem revelar
  SQL, host, stack trace ou credenciais quando o banco falha.
- O cPanel lista `gisleynunesimoveis.com.br` e
  `painel.gisleynunesimoveis.com.br`, ambos com Document Root no `public/` do
  checkout. O `public_html` do domínio principal antigo permanece intocado.

## Extensões exigidas

| Extensão | Obrigatória pelo runtime | HostGator |
| --- | --- | --- |
| ctype | Sim | PASS |
| curl | Sim | PASS |
| fileinfo | Sim | PASS |
| json | Sim | PASS |
| mbstring | Sim | PASS |
| openssl | Sim | PASS |
| pdo | Sim | PASS |
| pdo_mysql | Sim | PASS |

## Configuração aplicada no HostGator

- `.env` criado a partir de `.env.example`, com permissão `600`.
- `APP_ENV=production`, `APP_DEBUG=false`, URLs HTTPS e sessão/cache/fila
  compatíveis com hospedagem compartilhada.
- `APP_KEY` gerada diretamente pelo Laravel no servidor; o valor não foi lido
  nem exibido.
- Ranges oficiais atuais da Cloudflare configurados explicitamente em
  `TRUSTED_PROXIES`; nenhum wildcard foi usado.
- A base dedicada `gisley77_gisley_nunes` e o usuário dedicado
  `gisley77_gisley_app` estão configurados. A credencial só está no `.env`
  remoto.
- `SHOW GRANTS` não mostrou privilégios globais, mas mostrou `ALL PRIVILEGES`
  no schema dedicado; o privilégio mínimo depende do cPanel e permanece como
  pendência operacional.
- `migrate:status` confirmou as nove migrations como `Ran`; a base permanece
  sem dados de negócio.
- A sonda controlada confirmou InnoDB, FK, UNIQUE, índices e criação de
  triggers; todas as tabelas/objetos da sonda foram removidos.
- O servidor é MySQL 5.7.44. A migration
  `2026_10_04_000009_enforce_mysql_legacy_enum_integrity.php` adiciona guards
  por trigger porque MySQL 5.7 não aplica `CHECK` como MySQL 8.

## Artefatos preparados

`scripts/deploy-hostgator.sh` é deliberadamente fail-closed:

- rejeita `main` e qualquer branch diferente da branch Laravel;
- exige SHA completo pertencente à branch remota autorizada;
- recusa working tree sujo;
- exige `ALLOW_HOSTGATOR_DEPLOY=1`, `HEALTH_URL` e lock exclusivo;
- instala apenas dependências de produção;
- não executa migrations por padrão; `RUN_MIGRATIONS=1` é obrigatório para essa
  etapa explícita;
- recria caches e valida o corpo exato `{"status":"ok"}` do health check;
- registra apenas SHAs em `.deploy-state`, ignorado pelo Git.

`.github/workflows/hostgator-preflight.yml` é manual e somente prepara o pacote:
valida a branch, testa a sintaxe do script, instala dependências sem `--dev`,
faz boot/cache e confirma que não houve efeito de deploy. Ele não possui job SSH,
segredo, migration real ou publicação.

`.github/workflows/hostgator-deploy-gated.yml` está preparado, mas permanece
inativo enquanto `vars.HOSTGATOR_DEPLOY_ENABLED` não for `true`. Ele exige
branch fixa, SHA completo, ambiente `production`, secrets
`HOSTGATOR_SSH_PRIVATE_KEY`/`HOSTGATOR_KNOWN_HOSTS`, host/usuário/caminho em
variables, host key estrita e não usa autenticação por senha.

## Intervenções que ainda dependem do operador

1. Os testes independentes de origem HTTP, usando `curl --resolve` com Host
   header/SNI corretos, confirmaram `192.185.213.23` como o IP HTTP da
   aplicação. O IP histórico `192.185.176.183` está superseded e não deve ser
   usado em DNS.
2. Cadastrar no `.env` remoto os secrets reais do R2 e OAuth diretamente no
   servidor. Não enviar esses valores pelo chat.
3. Criar um cliente OAuth Web no Google Cloud, cadastrar o redirect URI
   exato `https://painel.gisleynunesimoveis.com.br/api/auth/callback` e preencher
   no `.env` remoto `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Para o
   primeiro gestor, preencher também `GISELY_ADMIN_BOOTSTRAP_EMAILS` com o
   e-mail Google verificado exato. Não enviar esses valores pelo chat.
4. Reduzir, se o cPanel permitir, os privilégios do usuário da aplicação ao
   mínimo necessário; o estado atual é isolado por schema, mas contém `ALL`.
5. A migration real foi executada na base dedicada em 2026-10-05; manter a
   confirmação de `migrate:status` como evidência antes de qualquer release.

## Atualização da execução remota — 2026-10-05

Após a confirmação explícita de execução, a migration foi aplicada na base
dedicada `gisley77_gisley_nunes` por SSH:

- MySQL HostGator `5.7.44-48` confirmou conexão pelo Laravel.
- As nove migrations `2026_10_02_000001` até
  `2026_10_04_000009` terminaram com `DONE`.
- `php artisan migrate:status` confirmou todas como `Ran`.
- A base continua dedicada ao projeto; não foram inseridos dados de negócio.
- O modo `migrate --pretend` não é uma prova válida para esta sequência: o
  Laravel cria a tabela `migrations` e migrations com `cursor()` não são
  compatíveis com o retorno simulado do framework. A execução real foi a
  validação usada para o MySQL 5.7.
- `app:production-check` passa em todos os controles de runtime e falha somente
  pela ausência de configuração R2 e OAuth.
- O cPanel agora lista `gisleynunesimoveis.com.br` como addon domain e
  `painel.gisleynunesimoveis.com.br` como subdomínio, ambos no `public/` do
  checkout. O módulo UAPI `AddonDomain` não está disponível, mas o `cpapi2`
  legado executou a configuração corretamente.
- O relatório histórico acima foi superseded: a origem HTTP correta é
  `192.185.213.23`, confirmada por `curl --resolve` e pelo health check Laravel.
  Não reutilizar `192.185.176.183`.
- As variables e secrets SSH do deploy foram cadastrados no repositório GitHub;
  `HOSTGATOR_DEPLOY_ENABLED` permanece `false`.

Estado atualizado: migration `PASS`; domínio/PHP-FPM público `BLOCKED`; R2 e
OAuth `BLOCKED`; deploy público `NÃO EXECUTADO`.
