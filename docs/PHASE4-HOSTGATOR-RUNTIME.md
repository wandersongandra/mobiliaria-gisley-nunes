# Fase 4 — Runtime HostGator

Data da verificação: 2026-10-03.

Esta fase foi executada sem deploy público, sem alteração de DNS, sem migration
da aplicação no banco HostGator e sem solicitar ou imprimir qualquer segredo.

## Resultado resumido

| Controle | Estado | Evidência |
| --- | --- | --- |
| HostGator SSH | PASS | Chave `gisley_hostgator_deploy` autenticou no host `192.185.213.23:2222`. |
| PHP CLI HostGator | PASS | PHP `8.3.35`, CLI, OPcache 8.3.35 e ionCube carregados. |
| PHP web / PHP-FPM | BLOCKED | O domínio público ainda não aponta para este checkout; não há domínio Laravel de staging configurado. |
| Extensões HostGator | PASS | pdo, pdo_mysql, openssl, mbstring, fileinfo, json, ctype, tokenizer e curl disponíveis. |
| Composer HostGator | PASS | `~/bin/composer` 2.10.3 e instalação `--no-dev` já confirmadas. |
| Laravel boot HostGator | PASS | `artisan` iniciou no checkout e `db:show` conectou à base dedicada. |
| `app:production-check` HostGator | FAIL | Todos os controles locais passaram; R2 e OAuth permanecem ausentes por dependerem de secrets externos. |
| Storage e permissões | PASS | Diretórios graváveis, sem `777`; probe temporário de escrita/remoção passou. |
| Apache / PHP-FPM | BLOCKED | `.htaccess` foi auditado estaticamente; handler web efetivo ainda não pode ser testado. |
| Document Root | BLOCKED | O cPanel mantém `public_html`; o projeto `public/` não foi apontado para um domínio. |
| MySQL HostGator | PASS | Conexão Laravel confirmada; MySQL `5.7.44-48`, base dedicada vazia. |
| Compatibilidade de migrations | PARCIAL | FK, UNIQUE, índices e triggers foram sondados; migration da aplicação não foi executada por segurança. |
| Health live/ready | BLOCKED | Os URLs públicos retornaram HTML LiteSpeed `200`, não o JSON Laravel esperado. |
| Cloudflare trusted proxy | PASS (configuração) | Ranges oficiais explícitos foram gravados no `.env`; tráfego Cloudflare real ainda não foi exercitado. |
| R2 real | BLOCKED | Não há credenciais autorizadas de bucket de teste. |
| OAuth real | BLOCKED | Não há provedor/callback de teste autorizado. |
| Infraestrutura automatizada | PASS (preparação) | Script SHA-locked e workflow gated com `StrictHostKeyChecking=yes` foram versionados; habilitação continua desligada. |
| Deploy público | NOT EXECUTED | Explicitamente não executado. |

## Evidência local confirmada

- Branch: `migration/laravel-backend-2026-10-02`.
- SHA inicial da fase: `3b78b474c2c6d8199697bc132939ac93fd61af4b`.
- O repositório contém a estrutura Laravel esperada e `composer.lock`.
- `composer.json` requer PHP `^8.2`, Laravel 12 e `pdo_mysql` é exigido pelo
  `app:production-check`.
- CI remoto já confirmou MySQL 8.4, migrations do zero, rollback, pacote sem
  dependências de desenvolvimento e caches Laravel.
- O `public/.htaccess` contém `Options -Indexes`, `RewriteEngine` e encaminha
  somente requisições que não sejam arquivos/diretórios para `public/index.php`.
- `/health/live` não acessa banco e `/health/ready` responde `503` sem revelar
  SQL, host, stack trace ou credenciais quando o banco falha.
- O cPanel não lista `gisleynunesimoveis.com.br`; lista somente os domínios
  temporários `meusitehostgator.com.br`. O `public_html` atual contém o site
  antigo e permanece intocado.

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
- Criada a base dedicada `gisley77_gisley_nunes` e o usuário dedicado
  `gisley77_gisley_app`. A senha foi gerada/resetada no servidor e só está no
  `.env` remoto.
- O usuário possui privilégios restritos à base dedicada. `SHOW GRANTS` não
  mostrou privilégios globais.
- `migrate:status` retornou `Migration table not found`, pois a base está vazia;
  `migrate --force` não foi executado.
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

1. Criar/configurar no cPanel o domínio de staging ou apontar o Document Root
   para `/home1/gisley77/repositories/mobiliaria-gisley-nunes/public` somente
   quando a janela de publicação for aprovada; isso não foi alterado.
2. Cadastrar no `.env` remoto os secrets reais do R2 e OAuth diretamente no
   servidor. Não enviar esses valores pelo chat.
3. Confirmar no provedor OAuth o redirect URI correspondente ao domínio de
   staging e fornecer o client secret no `.env`.
4. Cadastrar no GitHub Environment `production` os secrets
   `HOSTGATOR_SSH_PRIVATE_KEY` e `HOSTGATOR_KNOWN_HOSTS`, além das variables
   `HOSTGATOR_HOST`, `HOSTGATOR_PORT`, `HOSTGATOR_USER`, `DEPLOY_PATH`,
   `HEALTH_URL`; manter `HOSTGATOR_DEPLOY_ENABLED` desligada até aprovação.
5. Autorizar explicitamente a primeira execução de `migrate --force` na base
   dedicada depois que a migration 000009 estiver no checkout remoto.
