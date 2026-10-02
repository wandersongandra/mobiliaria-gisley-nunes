# Migração do backend para Laravel / HostGator

## Objetivo

Substituir o runtime Node.js/Express por PHP/Laravel sem alterar a experiência visual nem os contratos usados pelo painel administrativo.

## Arquitetura de produção

- **HostGator / Apache / PHP:** Laravel, páginas públicas, API e painel.
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
2. Execute `composer install --no-dev --optimize-autoloader`.
3. Copie `.env.example` para `.env` e configure os valores reais.
4. Execute `php artisan key:generate`.
5. Execute `php artisan migrate --force`.
6. Garanta permissão de escrita em `storage/` e `bootstrap/cache/`.
7. Execute `php artisan config:cache && php artisan route:cache && php artisan view:cache`.

Nunca deixe `.env`, `vendor/`, `storage/logs/` ou arquivos de banco acessíveis pelo Document Root.
