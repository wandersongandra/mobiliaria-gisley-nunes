# Security operations and release gate

Este documento complementa os controles implementados no código. Ele não substitui a
configuração do GitHub, Cloudflare, HostGator, MySQL, R2 ou Google OAuth.

## GitHub

Antes de proteger as branches, confirme a branch oficial de produção. Atualmente o
workflow legado aponta para `migration/laravel-backend-2026-10-02`, enquanto
`main` pode estar em outro estado.

Configurar manualmente:

- proteger `main`, a branch de migração e as branches de release;
- exigir Pull Request, revisão e os checks de qualidade, segurança, CodeQL e dependency review;
- bloquear push direto, force push e exclusão;
- exigir revisão de CODEOWNERS para workflows, autenticação, migrations, deploy e dependências;
- habilitar Secret Scanning e Push Protection;
- criar o ambiente `production` com aprovação obrigatória;
- restringir os segredos de deploy ao ambiente `production`;
- revisar periodicamente colaboradores, tokens, chaves SSH e instalações GitHub;
- adicionar um segundo revisor independente em `.github/CODEOWNERS`.

## Release

Cada publicação deve registrar:

- branch ou tag de origem;
- SHA completo;
- resultado de todos os checks;
- pessoa que aprovou;
- horário da janela;
- health check pós-deploy;
- SHA anterior para rollback.

O workflow de HostGator é manual e exige o SHA correspondente ao tip remoto da branch
autorizada. Rollback para um SHA anterior exige uma autorização explícita no servidor.

## HostGator

Validar antes do tráfego:

- Document Root apontando somente para `public/`;
- `.env` fora do Document Root e com permissão restrita;
- `APP_DEBUG=false`;
- `display_errors=Off`;
- PHP-FPM e extensões atualizados;
- execução PHP bloqueada em diretórios de mídia;
- listagem de diretórios desabilitada;
- SSH por chave, com known hosts fixo;
- cron do Laravel funcionando;
- logs protegidos e sem segredos;
- `php artisan app:production-check` aprovado;
- `/health/live` e `/health/ready` respondendo pelo domínio HTTPS.

## Cloudflare e R2

- modo TLS `Full (strict)`;
- DNS proxied;
- origem HostGator aceitando somente IPs oficiais da Cloudflare;
- WAF e rate limiting ativos;
- hostname administrativo separado;
- bucket R2 privado e sem listagem pública;
- CORS limitado ao `ADMIN_ORIGIN`;
- credencial R2 limitada ao bucket e prefixos necessários;
- URLs assinadas com validade curta;
- teste de acesso a foto não publicada e de URL expirada.

## MySQL e backups

- usuário de runtime sem privilégios de DDL;
- usuário de migration separado;
- TLS verificado para banco remoto;
- backup criptografado fora da hospedagem;
- teste de restauração em banco separado;
- retenção definida para leads e auditoria;
- nenhuma senha em histórico de shell ou arquivo público.

## OAuth

- callback HTTPS exato registrado no Google;
- client secret válido e rotacionável;
- contas administrativas protegidas por MFA;
- somente e-mails/convidados autorizados;
- teste de replay de state, convite e sessão revogada.

## Evidências mínimas para o veredito GO

O release só pode ser liberado quando houver evidência anexada para:

1. SHA publicado;
2. CI completo verde;
3. CodeQL PHP e JavaScript verde;
4. dependency review sem severidade alta;
5. secret scan com histórico completo;
6. produção-check aprovado;
7. R2 privado;
8. MySQL com privilégio mínimo;
9. backup restaurado com sucesso;
10. smoke test público e administrativo;
11. rollback documentado.

Sem essas evidências, o status permanece **NO-GO**.
