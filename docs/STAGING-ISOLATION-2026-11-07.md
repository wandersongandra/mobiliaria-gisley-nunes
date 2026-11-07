# Staging Gisley — isolamento antes da homologação

Data: 07/11/2026. Escopo: diagnóstico do cPanel HostGator e proteção do gate; **sem deploy, edição de `.env` remoto ou alteração no banco de produção**.

## Achados reproduzidos

1. `https://staging.gisleynunesimoveis.com.br/` respondeu `421` com `{"error":"MISDIRECTED_REQUEST"}`. A resposta corresponde ao middleware `RequireKnownHost`; não é prova de falha TLS/AutoSSL.
2. No release ativo por `staging_gisley/public` → `releases/20261024-cd2a8f6/public`, o `.env` privado declara `APP_ENV=production` e `APP_DEBUG=false`, mas `APP_URL` e `ADMIN_ORIGIN` apontam para os domínios públicos **de produção**. O `421` mantém a origem de staging bloqueada.
3. O mesmo `.env` aponta `DB_DATABASE` para `gisley77_gisley_nunes` e `DB_USERNAME` para o usuário **de produção**. Não corrigir apenas o domínio: isso passaria a servir staging conectado à base real.
4. A lista de bancos da hospedagem inclui `gisley77_gisley_verify29`, `gisley77_restore1106`, `gisley77_restoreqa06` e o banco de produção. O usuário temporário `gisley77_qa29` foi revogado no cPanel e nenhum outro usuário próprio de staging foi observado. As bases de restauração não tinham usuários privilegiados atribuídos.
5. O QA existente contém tabelas de identidade, equipe e convites. Sua utilização em staging requer decisão explícita de descaracterização/sanitização de dados e validação de privilégios; **não presumir que a cópia está anonimizada**.
6. O release de staging observado é antigo em relação ao código da PR #79. Sem migrations e teste web reais, a aprovação de CI não prova compatibilidade de MySQL 5.7 nem prontidão de produção.
7. O diretório privado `.gisley-backups` contém três conjuntos de backup; o mais recente, `gisley-20261107T061501Z-SEIy50`, apresenta `database.sql.gz` (20,22 KB), `media.tar.gz` (5,67 MB) e `complete.sha256` (161 bytes), todos com modo `0600`. Isso comprova **presença de artefatos**, não a integridade dos hashes nem a restauração funcional.

## Ordem segura de recuperação

1. Preservar a proteção atual do staging até que banco, mídia e credenciais estejam isolados.
2. Preparar banco **exclusivo de homologação**, sem dados pessoais reais desnecessários, e usuário próprio com privilégios somente nessa base. Não atribuir o usuário de produção à base de QA/restauração.
3. Preparar origem web `https://staging.gisleynunesimoveis.com.br` e origem administrativa separada, por exemplo `https://painel-staging.gisleynunesimoveis.com.br`, **somente após** confirmar DNS, vhost e HTTPS no cPanel; não reutilizar `painel.gisleynunesimoveis.com.br`.
4. Configurar no `.env` **do release de staging**, nunca no da produção: `APP_URL`, `ADMIN_ORIGIN`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DATABASE_URL=` vazio, `MAIL_MAILER=log`, sessão host-bound e `APP_DEBUG=false`. Manter a proteção `RequireKnownHost` ativa.
5. Antes de reiniciar o cache do Laravel, executar o gate offline de isolamento (abaixo). O comando não revela valores, senhas ou tokens e não testa a conexão real; exige valores de destino aprovados **fora** do `.env` inspecionado.
6. Fazer preflight de migrations em cópia descartável, validar compatibilidade MySQL 5.7/privilegios/triggers, cookies, login/autorização, CRUD, fotos e notificações, mais backup/restauração com integridade e rollback.
7. Só liberar o release da PR #79 quando CI, staging e rollback passarem juntos. **Não fazer merge nem deploy enquanto o ambiente de staging aponta para o banco de produção.**

### Gate offline de configuração

```bash
node scripts/verify-staging-isolation.mjs \
  --env-file /CAMINHO/PRIVADO/DO/STAGING/.env \
  --public-origin https://staging.gisleynunesimoveis.com.br \
  --admin-origin https://painel-staging.gisleynunesimoveis.com.br \
  --database NOME_DO_BANCO_ISOLADO \
  --production-database gisley77_gisley_nunes \
  --production-user gisley77_gisley_app
```

O resultado `PASS` cobre **apenas configuração estática**. A confirmação final exige checar acesso MySQL com usuário limitado, ausência de contato com serviços de produção, comportamento web e prova de que a restauração contém os dados esperados (contagens por tabela não bastam).

## Restrições operacionais

- Não inserir credenciais reais em logs, GitHub, issues ou mensagens.
- Não recriar o usuário `gisley77_qa29` apenas para facilitar testes; a conta foi revogada intencionalmente.
- Não alterar registros DNS da produção, permissões do usuário de produção, dados pessoais, storage real nem executar migrations até isolar o staging.
- A criação de nova conta MySQL ou edição de permissões no cPanel requer confirmação específica no momento da ação.
