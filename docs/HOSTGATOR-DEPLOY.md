# Deploy HostGator

## Pré-requisitos

- PHP 8.2 ou superior, extensões `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`
  e suporte a HTTPS.
- MySQL InnoDB com usuário de menor privilégio necessário para a aplicação.
- Document Root apontando exclusivamente para `public/`.
- SSH habilitado no plano e cron do cPanel disponível.

## Release

1. Faça backup do banco e preserve a versão anterior dos arquivos.
2. Envie o código sem `.env`, `node_modules`, `dist-preview` ou secrets.
3. Instale dependências: `composer install --no-dev --optimize-autoloader --no-interaction`.
4. Configure `.env` fora do Document Root com `APP_ENV=production`,
   `APP_DEBUG=false`, `APP_KEY`, URLs HTTPS, MySQL, R2 e OAuth.
5. Execute `php artisan migrate --force` e os caches de configuração, rota e
   view.
6. Garanta escrita somente em `storage/` e `bootstrap/cache/`.
7. Configure `* * * * * cd /CAMINHO/PROJETO && /CAMINHO/PHP artisan schedule:run >/dev/null 2>&1`.
8. Valide `/health/live` e `/health/ready` pelo domínio HTTPS.

O scheduler executa limpeza de uploads R2 órfãos e anonimização de leads. Não
depende de Redis, Supervisor, daemon Node ou worker permanente.

## Rollback

Restabeleça os arquivos da release anterior e restaure o banco somente se a
migration correspondente tiver rollback seguro e validado. Não remova objetos
R2 durante rollback: eles são dados independentes do release.
