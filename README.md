# Gisley Nunes Imóveis

Site institucional, catálogo imobiliário e CRM da Gisley Nunes Imóveis.

## Backend da branch de migração

O runtime principal está sendo migrado de **Node.js/Express para Laravel/PHP + MySQL**, mantendo os contratos usados pelo frontend e pelo painel administrativo.

- Laravel / PHP 8.2+
- MySQL
- Cloudflare R2 para fotos
- painel administrativo em `/admin`
- autenticação por OAuth com convite de equipe
- papéis Gestor e Corretor/Editor
- sessões revogáveis server-side
- CSRF, validação de origem, rate limiting e headers de segurança
- auditoria de ações críticas

O código Express anterior permanece temporariamente como referência durante a validação da migração, mas não será usado no runtime Laravel.

## Desenvolvimento

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

O frontend público e o painel usam assets estáticos em `public/assets` e `public/admin`; Node.js não será necessário em produção.

## Produção — HostGator / PHP-FPM

O alvo oficial de hospedagem é HostGator com Laravel em PHP-FPM, MySQL e Document Root apontado para `public/`. Node.js e Docker não fazem parte do runtime de produção. Consulte o guia de migração antes de configurar o ambiente.

Na hospedagem, instale as dependências de produção e prepare o cache:

```bash
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Configure também o cron do Laravel Scheduler descrito abaixo; ele remove uploads órfãos do R2 e anonimiza leads vencidos.

## Configuração de produção

Defina as variáveis no `.env` fora do Document Root. Não use os valores de exemplo em produção.

| Variável | Uso |
| --- | --- |
| `APP_KEY`, `APP_URL`, `APP_DEBUG=false` | Criptografia e endereço público do Laravel. Gere a chave uma vez e preserve-a nas atualizações. |
| `ADMIN_ORIGIN` | Origem HTTPS exata do painel; usada pela validação de origem e proteção CSRF. |
| `DB_CONNECTION=mysql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Acesso ao MySQL criado no cPanel. |
| `SESSION_DRIVER=file`, `SESSION_SECURE_COOKIE=true`, `CACHE_STORE=file` | Sessões e cache compatíveis com hospedagem compartilhada HTTPS. |
| `GISELY_ADMIN_OPEN_IDS` | Lista separada por vírgulas de IDs autorizados como gestores iniciais. |
| `GISELY_ADMIN_IDLE_TIMEOUT_MINUTES`, `GISELY_MAX_ADMIN_SESSIONS` | Limite de inatividade e sessões administrativas simultâneas. |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_UPLOAD_EXPIRES_SECONDS` | Upload pré-assinado e limpeza dos arquivos no Cloudflare R2. |
| `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, `MANUS_PROJECT_ID` | Endpoints e projeto do provedor OAuth. |

Consulte `.env.example` para a lista completa. Após alterar variáveis, limpe e gere novamente o cache da configuração com `php artisan config:clear && php artisan config:cache`.

## Cron na HostGator

No cPanel, crie uma tarefa para executar o Scheduler a cada minuto. Substitua pelos caminhos absolutos do projeto e do PHP fornecidos pela HostGator:

```cron
* * * * * cd /CAMINHO/ABSOLUTO/DO/PROJETO && /CAMINHO/DO/PHP artisan schedule:run >/dev/null 2>&1
```

O Scheduler limpa diariamente, às 03:00, uploads R2 sem registro no banco após 24 horas. Às 03:30, anonimiza nome, e-mail, mensagem e caminho do imóvel de leads fechados ou perdidos há mais de dois anos. Sem o cron, essas rotinas não executam.

## Backup e restauração do MySQL

Faça backups regulares e guarde-os fora do Document Root, com acesso restrito e criptografia em repouso: os dumps contêm dados pessoais de leads. O comando pede a senha sem colocá-la no histórico do shell:

```bash
mysqldump --host=DB_HOST --user=DB_USER --password --single-transaction --routines --triggers --default-character-set=utf8mb4 DB_NAME > gisley-$(date +%F-%H%M%S).sql
```

Para restaurar, crie primeiro um banco vazio de recuperação pelo cPanel e importe nele. Valide o conteúdo antes de trocar a configuração ativa:

```bash
mysql --host=DB_HOST --user=DB_USER --password DB_RESTORE_NAME < gisley-backup.sql
```

As fotos ficam no R2 e não estão dentro do dump MySQL; mantenha uma política independente de retenção ou cópia dos objetos no provedor. Teste a restauração periodicamente em um banco separado.

## Health check do runtime

Depois do deploy, confirme que o domínio está atendendo Laravel pelo PHP-FPM configurado no cPanel:

```bash
curl --fail --silent --show-error https://SEU_DOMINIO/_app/health | grep -Fx '{"status":"ok"}'
```

O endpoint deve responder HTTP 200 com `{"status":"ok"}`. A comparação do corpo evita tratar uma página estática de fallback como health check. Isso valida o roteamento HTTP pelo runtime Laravel/PHP-FPM; a conexão com o banco pode ser conferida separadamente com `php artisan migrate:status`. Não publique `phpinfo()`.

## Gates locais e CI

```bash
composer run format:check
composer run analyse
composer run test
composer audit --no-interaction
```

O CI executa esses gates em SQLite e roda novamente migrações e testes em MySQL 8.4.

A suíte é hermética: `phpunit.xml` declara `DB_CONNECTION=sqlite` com `DB_DATABASE=:memory:` e os demais valores de ambiente necessários, então `composer run test` roda em qualquer checkout, sem MySQL e sem arquivo `.env`. Os `<env>` do PHPUnit usam `force="false"` (padrão), ou seja, variáveis já exportadas no ambiente vencem — é assim que o job MySQL do CI continua testando contra MySQL 8.4.

Em máquinas sem o Composer no PATH, os mesmos gates podem ser executados diretamente:

```bash
vendor/bin/pint --test
vendor/bin/phpstan analyse --no-progress
vendor/bin/phpunit --testsuite=Feature
```

Não existe o comando `php artisan test` neste projeto, porque o `nunomaduro/collision` não é uma dependência.
