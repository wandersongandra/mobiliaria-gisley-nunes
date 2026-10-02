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

## Produção

Configure o Document Root para `public/` e então:

```bash
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Veja `docs/laravel-hostgator-migration.md` para o procedimento de hospedagem.
