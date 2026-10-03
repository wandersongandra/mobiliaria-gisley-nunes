# Migração do backend para Laravel / HostGator

## Objetivo

Substituir o runtime Node.js/Express por PHP/Laravel sem alterar a experiência visual nem os contratos usados pelo painel administrativo.

## Arquitetura de produção

- **HostGator / Apache / PHP-FPM:** Laravel, páginas públicas, API e painel.
- **MySQL:** tabelas `morada_*`, mantendo os nomes do backend anterior para facilitar migração de dados.
- **Cloudflare:** DNS/WAF/CDN.
- **Cloudflare R2:** fotos dos imóveis com upload direto por URL pré-assinada.
- **Node.js:** não é necessário em runtime. Os assets públicos são entregues como JS/CSS estáticos.

## Contratos preservados

- `/api/properties` e `/api/properties/:slug`
- `/api/site` e `/api/contact`
- `/api/auth/login`, `/callback`, `/logout`, `/logout-all`
- `/api/admin/session`
- CRUD de imóveis, fotos e capa
- leads
- dados institucionais e depoimentos
- convites de equipe e papéis `manager` / `editor`
- auditoria
- expiração e revogação server-side de sessões
- R2

## Deploy HostGator

1. Aponte o Document Root do domínio para a pasta `public/`.
2. Selecione PHP 8.2 no cPanel e execute `composer install --no-dev --optimize-autoloader --no-interaction`.
3. Copie `.env.example` para `.env` e configure os valores reais.
4. Execute `php artisan key:generate`.
5. Execute `php artisan migrate --force`.
6. Garanta permissão de escrita em `storage/` e `bootstrap/cache/`.
7. Execute `php artisan config:cache && php artisan route:cache && php artisan view:cache`.
8. Configure no Cron Jobs do cPanel uma execução por minuto do scheduler Laravel, usando o binário PHP e o caminho absoluto do projeto:

   ```cron
   * * * * * cd /CAMINHO/ABSOLUTO/DO/PROJETO && /CAMINHO/DO/PHP artisan schedule:run >/dev/null 2>&1
   ```

   O scheduler limpa diariamente às 03:00 uploads R2 sem registro no banco após 24 horas e anonimiza às 03:30 leads fechados ou perdidos há mais de dois anos. Sem o cron, essas rotinas não serão executadas.

## Variáveis de ambiente

Configure no `.env`, fora do Document Root e sem versionar credenciais:

- Laravel: `APP_KEY`, `APP_URL`, `APP_DEBUG=false`, `ADMIN_ORIGIN`.
- MySQL: `DB_CONNECTION=mysql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
- Sessão e cache: `SESSION_DRIVER=file`, `SESSION_SECURE_COOKIE=true`, `SESSION_LIFETIME`, `CACHE_STORE=file`.
- Gestores: `GISELY_ADMIN_OPEN_IDS`, `GISELY_ADMIN_IDLE_TIMEOUT_MINUTES`, `GISELY_MAX_ADMIN_SESSIONS`.
- Cloudflare R2: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_UPLOAD_EXPIRES_SECONDS`.
- OAuth: `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, `MANUS_PROJECT_ID`.

Use `.env.example` como referência, nunca como fonte de credenciais de produção. Gere `APP_KEY` uma vez e preserve-a entre releases.

## Health check e recuperação

Após configurar o domínio com PHP-FPM, valide pelo próprio domínio:

```bash
curl --fail --silent --show-error https://SEU_DOMINIO/_app/health
```

O endpoint deve responder HTTP 200. Isso verifica o caminho HTTP pelo Laravel em execução; use `php artisan migrate:status` para confirmar separadamente o acesso ao banco. Não exponha `phpinfo()`.

As instruções de backup e restauração do MySQL estão em `README.md`. Restaure primeiro em um banco vazio separado e valide antes de apontá-lo para o domínio. As fotos ficam no R2 e precisam de uma política independente de cópia/recuperação.

Nunca deixe `.env`, `vendor/`, `storage/logs/` ou arquivos de banco acessíveis pelo Document Root.
