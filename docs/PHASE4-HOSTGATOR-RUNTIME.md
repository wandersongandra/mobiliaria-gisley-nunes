# Fase 4 — Runtime HostGator

Data da verificação: 2026-10-03.

Esta fase foi executada sem deploy público, sem alteração de DNS, sem migration
no banco HostGator e sem solicitar ou imprimir qualquer segredo.

## Resultado resumido

| Controle | Estado | Evidência |
| --- | --- | --- |
| HostGator SSH | BLOCKED | O TCP/SSH respondeu, mas a autenticação foi recusada: `Permission denied (publickey,password,keyboard-interactive)`. |
| PHP CLI HostGator | NÃO VERIFICADO | A sessão autenticada não foi estabelecida. A versão `8.3.35` foi informada pelo operador, mas não foi revalidada nesta rodada. |
| PHP web / PHP-FPM | BLOCKED | Requer acesso autenticado e um domínio de teste configurado. |
| Extensões HostGator | BLOCKED | A matriz só pode ser produzida por `php -m` no servidor alvo. |
| Composer HostGator | BLOCKED | Composer global foi informado como ausente; instalação no usuário aguarda acesso SSH. |
| Laravel boot HostGator | BLOCKED | Não foi executado `artisan about` no servidor. |
| `app:production-check` HostGator | BLOCKED | Não foi executado no ambiente real; não houve configuração falsa. |
| Storage e permissões | BLOCKED | Não foi possível inspecionar nem escrever no servidor. |
| Apache / PHP-FPM | BLOCKED | Handler e `.htaccess` só podem ser confirmados no Document Root real. |
| Document Root | BLOCKED | O alvo esperado é `.../public`, mas o caminho efetivo não foi confirmado. |
| MySQL HostGator | BLOCKED | Nenhuma conexão ou `migrate:status` foi executada. |
| Compatibilidade de migrations | BLOCKED | CI MySQL 8 passou; permissões e versão do banco HostGator continuam não verificadas. |
| Health live/ready | BLOCKED | Não há domínio de staging validado nesta fase. |
| Cloudflare trusted proxy | BLOCKED | Os CIDRs reais ainda não foram configurados nem confirmados no origin. |
| R2 real | BLOCKED | Não há credenciais autorizadas de bucket de teste. |
| OAuth real | BLOCKED | Não há provedor/callback de teste autorizado. |
| Infraestrutura automatizada | PARCIAL | Script e workflow manual foram preparados; nenhum acesso SSH ou deploy foi ativado. |
| Deploy público | NOT EXECUTED | Explicitamente não executado. |

## Evidência local confirmada

- Branch: `migration/laravel-backend-2026-10-02`.
- SHA local e remoto no início da fase: `c9556148510664efc4151c0cec7cd9e01bc29b06`.
- O repositório contém a estrutura Laravel esperada e `composer.lock`.
- `composer.json` requer PHP `^8.2`, Laravel 12 e `pdo_mysql` é exigido pelo
  `app:production-check`.
- CI remoto já confirmou MySQL 8.4, migrations do zero, rollback, pacote sem
  dependências de desenvolvimento e caches Laravel.
- O `public/.htaccess` contém `Options -Indexes`, `RewriteEngine` e encaminha
  somente requisições que não sejam arquivos/diretórios para `public/index.php`.
- `/health/live` não acessa banco e `/health/ready` responde `503` sem revelar
  SQL, host, stack trace ou credenciais quando o banco falha.

## Extensões exigidas

| Extensão | Obrigatória pelo runtime | HostGator |
| --- | --- | --- |
| ctype | Sim | NÃO VERIFICADO |
| curl | Sim | NÃO VERIFICADO |
| fileinfo | Sim | NÃO VERIFICADO |
| json | Sim | NÃO VERIFICADO |
| mbstring | Sim | NÃO VERIFICADO |
| openssl | Sim | NÃO VERIFICADO |
| pdo | Sim | NÃO VERIFICADO |
| pdo_mysql | Sim | NÃO VERIFICADO |

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

## Próximo passo bloqueado

O operador precisa disponibilizar uma chave pública de deploy específica no
`authorized_keys` de `gisley77` e manter a chave privada somente no ambiente
autorizado. Depois disso, a inspeção deve ser repetida com os comandos de leitura
da Fase 1. Nenhuma senha, private key, `APP_KEY`, credencial MySQL, R2 ou OAuth
deve ser enviada pelo chat.

Até essa autenticação e a criação de um banco/staging autorizado, os estados
HostGator, PHP web, MySQL, health e permissões permanecem `BLOCKED`.
