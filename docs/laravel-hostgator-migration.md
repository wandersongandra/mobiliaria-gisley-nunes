# Migração do backend para Laravel / HostGator

## Objetivo

Substituir o runtime Node.js/Express por PHP/Laravel sem alterar a experiência visual nem os contratos usados pelo painel administrativo.

## Arquitetura de produção

- **HostGator / Apache / PHP-FPM:** Laravel, páginas públicas, API e painel.
- **MySQL:** tabelas `morada_*`, mantendo os nomes do backend anterior para facilitar migração de dados.
- **Cloudflare:** DNS/WAF/CDN.
- **Mídia local:** novas fotos dos imóveis ficam em `MEDIA_ROOT`, fora do Document Root, e são entregues pelo Laravel.
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
- storage local privado

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

   O scheduler limpa diariamente às 03:00 uploads locais sem registro no banco após 24 horas e anonimiza às 03:30 leads fechados ou perdidos há mais de dois anos. Sem o cron, essas rotinas não serão executadas.

## Variáveis de ambiente

Configure no `.env`, fora do Document Root e sem versionar credenciais:

- Laravel: `APP_KEY`, `APP_URL`, `APP_DEBUG=false`, `ADMIN_ORIGIN`.
- MySQL: `DB_CONNECTION=mysql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
- Sessão e cache: `SESSION_DRIVER=file`, `SESSION_SECURE_COOKIE=true`, `SESSION_LIFETIME`, `CACHE_STORE=file`.
- Gestores: `GISELY_ADMIN_OPEN_IDS`, `GISELY_ADMIN_IDLE_TIMEOUT_MINUTES`, `GISELY_MAX_ADMIN_SESSIONS`.
- Mídia local: `MEDIA_ROOT=storage/app/private/media` ou um caminho absoluto privado fora de `public/`. Caminhos relativos são resolvidos a partir da raiz do projeto.
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
  `GISELY_ADMIN_BOOTSTRAP_EMAILS` para a lista explícita de e-mails Google
  verificados autorizados no primeiro bootstrap.

  O callback cadastrado no Google Cloud deve ser exatamente
  `https://painel.gisleynunesimoveis.com.br/api/auth/callback`.

Use `.env.example` como referência, nunca como fonte de credenciais de produção. Gere `APP_KEY` uma vez e preserve-a entre releases.

## Health check e recuperação

Após configurar o domínio com PHP-FPM, valide pelo próprio domínio:

```bash
curl --fail --silent --show-error https://SEU_DOMINIO/health/live | grep -Fx '{"status":"ok"}'
curl --fail --silent --show-error https://SEU_DOMINIO/health/ready | grep -Fx '{"status":"ok"}'
```

Os endpoints devem responder HTTP 200 com `{"status":"ok"}`. Comparar o corpo evita considerar uma página estática de fallback como uma resposta válida. `live` verifica o runtime Laravel e `ready` confirma também o banco, sem expor detalhes internos. `/_app/health` permanece como alias compatível. Não exponha `phpinfo()`.

As instruções de backup e restauração do MySQL estão em `README.md`. Restaure primeiro em um banco vazio separado e valide antes de apontá-lo para o domínio. O diretório `MEDIA_ROOT` precisa de uma política independente de cópia/recuperação. A migração física de objetos que ainda estejam somente no R2 não é automática e permanece pendente até uma cópia autorizada e verificada.

Nunca deixe `.env`, `vendor/`, `storage/logs/` ou arquivos de banco acessíveis pelo Document Root.
