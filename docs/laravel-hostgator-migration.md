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

   O scheduler executa diariamente às 03:00 a limpeza de uploads R2 sem registro no banco após 24 horas. Sem o cron, a limpeza não será executada.

Nunca deixe `.env`, `vendor/`, `storage/logs/` ou arquivos de banco acessíveis pelo Document Root.
