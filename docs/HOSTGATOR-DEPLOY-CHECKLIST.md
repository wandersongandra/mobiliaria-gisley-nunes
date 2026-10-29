# Publicação HostGator — procedimento obrigatório

Este fluxo é manual e **não** executa deploy automaticamente por push ou merge.
O workflow é versionado na `main`; o código publicado vem exclusivamente da
branch `migration/laravel-backend-2026-10-02` no SHA exato solicitado.

## Antes de autorizar

1. Confirmar o SHA de 40 caracteres no topo da branch Laravel e os quatro
   workflows de **push** verdes para esse SHA: qualidade, Laravel CI, CodeQL
   e pacote de produção. Checks de PR não substituem checks de push.
2. No ambiente `production`, exigir revisão humana e validar as credenciais
   SSH e `known_hosts`. Habilitar `HOSTGATOR_DEPLOY_ENABLED=true` somente na
   janela aprovada; desabilitar novamente depois.
3. Confirmar previamente `/health/live` e `/health/ready` via HTTPS. Se um
   403 aparecer, diferenciar proteção/WAF de falha real e obter uma sonda
   válida antes de publicar. O deploy aborta se o health check falhar.
4. Verificar o estado real de `php artisan migrate:status` **na HostGator**,
   além dos privilégios do usuário e da compatibilidade com MySQL 5.7.
5. Fazer backup criptografado do MySQL, fora do Document Root, e **testar a
   restauração em banco separado**. Guardar identificador/hashes e evidências
   da restauração fora do GitHub. Validar também backup independente da mídia.

## Como executar no GitHub

1. Actions → **HostGator deploy (gated; run from main)** → Run workflow.
2. No seletor **Use workflow from**, selecionar **`main`**, mesmo que o código
   a publicar esteja na branch Laravel. Selecionar a branch Laravel nesse
   campo faz o job ser `skipped` por segurança.
3. Informar:
   - `ref`: `migration/laravel-backend-2026-10-02`
   - `sha`: SHA completo aprovado e verificado
   - `confirm`: `ENABLE_HOSTGATOR_DEPLOY`
   - `run_migrations`: **true** se existem migrations pendentes, ou **false**
     somente quando o esquema de produção já está atualizado.
   - `db_readiness`: com `run_migrations=true`, digitar exatamente
     `BACKUP_RESTORED_AND_VERIFIED` **após** validar backup e restauração;
     com `run_migrations=false`, digitar exatamente `SCHEMA_ALREADY_CURRENT`
     **após** verificar que não há migrations pendentes.

Um valor vazio, trocado ou inexato em `db_readiness` deve falhar antes de
qualquer conexão SSH. O `run_migrations` padrão é `false`, e não uma
autorização para ignorar uma migration necessária.

## Depois de publicar

- Confirmar logs completos de `migrate --force` quando aplicável e registrar
  o SHA do deploy, o operador e o horário da janela.
- Validar `GET /health/live` e `GET /health/ready` via HTTPS, catálogo,
  autenticação do painel, cadastro/edição de imóvel e operações novas do CRM.
- Monitorar erros 4xx/5xx, permissões e banco. Revogar a janela de deploy.
- Manter plano de retorno para o código anterior e backup do banco restaurável.
  **Voltar o código não desfaz automaticamente migrations.** MySQL pode deixar
  DDL parcialmente aplicado se uma migration falhar; isso exige tratamento
  explícito, não um rollback automático às cegas.

Este documento e as confirmações do formulário são barreiras contra erros
operacionais, mas **não substituem a prova externa do backup**, revisão de
produção ou acesso real à HostGator.
