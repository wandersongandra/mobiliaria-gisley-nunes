# Operações de segurança — Imobiliária Gisley Nunes

Estado: procedimentos preparados em branch de desenvolvimento. **Nenhuma configuração
de MFA de terceiros, cron de backup, notificação externa ou banco de produção foi
alterada automaticamente.** Antes de marcar um controle como ativo, obter evidência
do provedor ou do servidor. O login Google **não atesta**, pelo endpoint `userinfo`,
que o titular concluiu uma segunda etapa de autenticação.

## 1. MFA: contas que realmente controlam o site

| Superfície | Evidência exigida | Responsável |
| --- | --- | --- |
| Conta Google de cada manager/editor | Verificação em duas etapas habilitada e recuperação testada, sem compartilhar códigos | Titular da conta |
| Portal HostGator | Status de 2FA habilitado em **Perfil > Segurança da conta** | Titular da hospedagem |
| cPanel/SSH | 2FA próprio do cPanel, se recurso liberado; SSH por chave, sem senha compartilhada | Administrador de hospedagem |
| GitHub de deploy | 2FA/passkey e método reserva, branch protection, secrets restritos | Dono do repositório |

Guia Google: https://support.google.com/accounts/answer/185839?hl=pt

Guia HostGator: https://suporte.hostgator.com.br/hc/pt-br/articles/31973903927059-Como-habilitar-ou-desabilitar-a-autentica%C3%A7%C3%A3o-de-duplo-fator-2FA-para-acessar-ao-Portal-do-Cliente

Guia cPanel: https://docs.cpanel.net/cpanel/security/two-factor-authentication-for-cpanel/

Guia GitHub: https://docs.github.com/pt/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication

- Não enviar QR, seed TOTP, código SMS, código de recuperação ou chave privada no chat, issues ou repositório.
- **Não desligar acesso existente** até o titular comprovar login e recuperação do novo fator.
- Contas Google pessoais devem ativar 2SV individualmente. Se houver Google Workspace,
  o administrador poderá avaliar política central de 2SV; isso **não** está configurado aqui.
- Para exigir MFA independente do Google no próprio Laravel, será necessário projeto
  específico de inscrição, recuperação e challenge com testes de bloqueio. **Não está ativo.**

## 2. Revisão trimestral e ao desligamento de colaboradores

O servidor possui as roles `manager` e `editor`. O editor pode ler e atualizar
imóveis/atendimentos dentro das regras existentes, mas **não** exportar ou excluir
leads, excluir imóveis, ler auditoria ou gerir equipe. O manager possui as
capacidades sensíveis. Os testes automatizados impedem a regressão dessa matriz.

Para cada acesso em `morada_staff_access`:

1. Verificar com a imobiliária se a pessoa ainda trabalha no atendimento.
2. Confirmar vínculo com o Google `sub` e necessidade da role atual.
3. Desativar no painel os acessos desnecessários; inspecionar sessões ativas.
4. Revogar sessões em caso de desligamento e verificar `auth.logout_all`/auditoria.
5. Revisar especialmente `GISELY_ADMIN_OPEN_IDS` e `GISELY_ADMIN_BOOTSTRAP_EMAILS`:
   bootstrap é acesso de emergência **manager** que independe do cadastro de equipe.
   Reduzi-lo à menor lista necessária requer aprovação do titular.

Não inserir e-mails ou identificadores reais em tickets públicos de segurança.

## 3. Monitoramento técnico

Foi criada a leitura agregada, sem mutação de dados:

```bash
php artisan gisley:security-monitor --fail-on-alert
```

Com o scheduler Laravel ativo, a execução fica agendada a cada hora, no minuto
15. O comando consulta a auditoria da última hora e verifica:

| Métrica | Limite inicial | Observação |
| --- | ---: | --- |
| `logins_per_hour` | 20 | Apenas logins concluídos; callbacks inválidos não entram na auditoria |
| `exports_per_hour` | 5 | Exportações de leads |
| `destructive_per_hour` | 5 | Exclusões/arquivamentos administrativos |
| `team_changes_per_hour` | 3 | Convites e mudanças de acesso |
| `inactive_staff_sessions` | 0 | Sessões ainda não revogadas após inativação de staff; a autorização atual já revalida o vínculo |
| `invalid_staff_roles` | 0 | Dados fora do enum permitido |

Limiares são configurados via `GISELY_SECURITY_*_ALERT_THRESHOLD`, conforme `.env.example`.
Ultrapassar um limite grava `security.monitor.threshold_exceeded` no log Laravel
com nome da métrica, contagem e limiar, **sem e-mails, tokens, IPs ou leads**.
A flag `--fail-on-alert` sinaliza alerta com exit code não zero.

**Limitação:** log local não equivale a notificação. Para alertas recebidos por
alguém, configurar coletor externo/alarme aprovado; testar entrega, supressão
de duplicidade e escalonamento. Confirmar `php artisan schedule:list` e o cron
HostGator existente antes de considerar a execução periódica ativa.

## 4. Backup criptografado, retenção e restauração

### Alternativa simplificada escolhida: backup na mesma HostGator

O titular decidiu inicialmente armazenar as cópias no **mesmo plano de
hospedagem da Gisley Nunes**, sem contratar serviços ou utilizar servidores de
outros projetos. Isso cobre exclusão acidental e erro de atualização quando os
arquivos de backup continuam íntegros. **Não cobre pane ou perda do servidor,
sequestro da conta cPanel, ransomware no mesmo usuário ou falha do provedor.**

O script `scripts/backup-hostgator-local.sh` salva o banco MySQL e a pasta
privada de fotos em conjuntos `database.sql.gz`, `media.tar.gz` e
`complete.sha256`. Ele verifica hashes e a leitura dos arquivos comprimidos,
e mantém as **últimas 7 cópias completas** por padrão. Os arquivos não são
criptografados: devem ficar exclusivamente numa pasta `700` **fora da
aplicação e do document root**, com acesso limitado ao próprio usuário cPanel.
Não publicar, anexar em tickets ou enviar os conjuntos por e-mail.

Configuração mínima no plano HostGator atual, após conferir os caminhos reais:

1. Criar `/home1/gisley77/.gisley-backups` com modo `700`; criar um arquivo
   de opções MySQL fora do site, modo `600`, com usuário de leitura/backup,
   por exemplo `/home1/gisley77/.gisley-backup-mysql.cnf`.
2. Definir no cron do cPanel as variáveis `GISELY_LOCAL_BACKUP_DIR`,
   `GISELY_LOCAL_BACKUP_MYSQL_DEFAULTS_FILE`,
   `GISELY_LOCAL_BACKUP_DATABASE` e executar o script com `--run`. O diretório
   de fotos padrão é `storage/app/private/media` do projeto implantado.
3. Antes de agendar, executar `--check` e `--run` manualmente; conferir
   `--verify-latest` e realizar **um restore real em banco e pasta isolados**.
   Só então ativar um cron diário no horário de menor tráfego.
4. Acompanhar o espaço livre do volume compartilhado. A rotina recusa iniciar
   se houver menos de 512 MiB disponíveis; ela não substitui o alerta de disco.

Exemplo de execução manual (nunca incluir a senha MySQL na linha de comando):

```bash
export GISELY_LOCAL_BACKUP_DIR=/home1/gisley77/.gisley-backups
export GISELY_LOCAL_BACKUP_MYSQL_DEFAULTS_FILE=/home1/gisley77/.gisley-backup-mysql.cnf
export GISELY_LOCAL_BACKUP_DATABASE=gisley77_gisley_nunes
bash scripts/backup-hostgator-local.sh --check
bash scripts/backup-hostgator-local.sh --run
bash scripts/backup-hostgator-local.sh --verify-latest
```

**Status:** automação preparada no código, mas cron e restauração real devem
ser comprovados no cPanel para o controle ser considerado ativo.

### Opção futura: cópia criptografada fora da hospedagem

O script `scripts/backup-hostgator-encrypted.sh` captura **MySQL e fotos locais
privadas** em dois objetos CMS criptografados, com um manifesto SHA-256, sem
persistir dump SQL nem fotos em claro no diretório de backups. Não faz upload,
remove arquivos antigos, altera tabelas ou cria cron automaticamente.

### Antes do primeiro backup externo

1. Em **máquina administrativa fora da HostGator**, gerar certificado público
   e chave privada protegida por senha (a chave privada nunca vai ao servidor):

   ```bash
   openssl req -x509 -newkey rsa:3072 -aes256 -days 365 \
     -keyout backup-private.pem -out backup-public.pem \
     -subj '/CN=Gisley Backup Encryption'
   ```

2. Guardar a chave privada e sua senha num cofre separado, com cópia de
   recuperação sob custódia do proprietário. Enviar **somente** `backup-public.pem`
   à pasta privada do usuário de backup no servidor.
3. Calcular a impressão SHA-256 do certificado público:

   ```bash
   openssl x509 -in backup-public.pem -outform DER | sha256sum
   ```

4. Criar `mysql-backup.cnf` fora de `public/`, permissão `chmod 600`, com
   `[client]`, `host`, `user`, `password` e, se necessário, `port`. O usuário
   deve ter apenas permissões de leitura/backup compatíveis com `mysqldump`
   (`SELECT`, `SHOW VIEW`, `TRIGGER`, e as necessárias para routines/events).
   **Não usar o usuário web se houver alternativa de menor privilégio.**
5. Apontar `GISELY_BACKUP_OUTPUT_DIR` para destino privado **sincronizado fora
   da hospedagem**, com capacidade e acesso restritos; apontar
   `GISELY_BACKUP_MEDIA_ROOT` para `storage/app/private/media` real.
   Configurar também `GISELY_BACKUP_MYSQL_DEFAULTS_FILE`,
   `GISELY_BACKUP_DATABASE`, `GISELY_BACKUP_CERT_FILE` e
   `GISELY_BACKUP_CERT_SHA256`. Nunca copiar esses dados ao repositório.

### Validação e execução

```bash
bash scripts/backup-hostgator-encrypted.sh --check
bash scripts/backup-hostgator-encrypted.sh --run
```

O `--check` não lê os dados do banco nem cria backup. O `--run` deve ser usado
em janela controlada, após validação do cliente MySQL, espaço livre e montagem
off-site. **Não habilitar cron diário antes da primeira restauração bem-sucedida.**

### Verificação fora da hospedagem

Copiar as duas saídas `.cms` e o manifesto `.sha256` para ambiente isolado.
**A chave privada só pode existir neste ambiente externo, nunca no servidor
HostGator nem em um runner de CI.** Validar a integridade do conjunto e a
descriptografia sem gravar SQL/fotos em claro:

```bash
bash scripts/verify-hostgator-encrypted-set.sh \
  --manifest /backup-externo/gisley-YYYYMMDDTHHMMSSZ-manifest-XXXXXXXX.sha256 \
  --certificate /cofre/backup-public.pem

GISELY_RESTORE_PRIVATE_KEY=/cofre/backup-private.pem \
  bash scripts/verify-hostgator-encrypted-set.sh \
  --manifest /backup-externo/gisley-YYYYMMDDTHHMMSSZ-manifest-XXXXXXXX.sha256 \
  --certificate /cofre/backup-public.pem
```

O verificador rejeita conjuntos incompletos, nomes/caminhos inesperados,
arquivos modificados e mídia ou SQL que não possam ser descriptografados.
Ele **não substitui** um restore real: a recuperação no banco descartável é
obrigatória para confirmar integridade da aplicação.

Usar a chave privada fora da produção para restaurar o SQL e a mídia em
diretórios exclusivos de teste:

```bash
openssl cms -decrypt -inform DER -in banco.sql.gz.cms \
  -recip backup-public.pem -inkey backup-private.pem | gzip -dc > restauracao.sql
openssl cms -decrypt -inform DER -in midia.tar.gz.cms \
  -recip backup-public.pem -inkey backup-private.pem | tar -xzf - -C pasta-isolada
```

Os nomes `banco.sql.gz.cms` e `midia.tar.gz.cms` acima são exemplos. Restaurar
SQL **somente em banco descartável separado**, conferir tabelas, relacionamentos,
quantidade de imóveis/leads e consistência de fotos sem publicar dados de
clientes. Registrar data, SHA do backup e veredito; remover cópias de teste
segundo política de retenção aprovada.

- Política proposta: backup diário, 7 diários + 4 semanais + 12 mensais em
  **armazenamento externo criptografado e com versionamento/imutabilidade**.
  Custo e prazo de retenção precisam de aprovação da imobiliária.
- Testar restauração mensalmente e antes de qualquer migration destrutiva.
- Manter `APP_KEY`, `.env` e credenciais necessários à recuperação em cofre
  independente: o script **não** faz cópia desses segredos.
- O SHA-256 no mesmo destino detecta corrupção acidental, **não** prova
  autenticidade contra invasor capaz de modificar arquivos e manifesto.
  Usar controle de acesso, versionamento imutável e monitoramento de transferência.

## 5. Critérios de aceite operacional

- MFA demonstrado por cada titular, inclusive HostGator/GitHub, sem enviar códigos.
- Lista de staff/roles revisada e sessões de desligados revogadas.
- Scheduler/monitor efetivamente executando, log coletado e alerta recebido.
- Backup SQL + mídia enviado a destino externo, checksum verificado e restauração
  mensal documentada em ambiente isolado.
- CI Laravel e teste do backup verde; smoke administrativo e público antes de
  qualquer merge/deploy.

Até reunir essas evidências, os controles permanecem **preparados, não ativados
operacionalmente**.

## 6. Inspeção HostGator em 06/11/2026 (somente leitura)

- Portal do titular: 2FA **habilitado**; isso não comprova MFA do Google,
  GitHub ou cPanel separadamente.
- cPanel `br64`: MySQL `5.7.44-48`; sem backups automáticos disponibilizados
  na página *Backup*. O produto comercial Gator Backup não foi contratado
  por esta intervenção.
- *Cron Jobs*: apenas `artisan schedule:run` do staging, com expressão
  `*/21 * * * *`; **nenhum cron de produção evidenciado**.
- Usuário MySQL de produção: `ALL PRIVILEGES` sobre o banco. Uma conta web de
  menor privilégio exige separar explicitamente a credencial de migração e
  testar autorização no Laravel antes de alterar a produção.
- Sem usuários FTP adicionais. Preferências usuais de avisos do cPanel
  ativadas. Alertas básicos do cPanel não substituem o monitor Laravel.
- `br64` reporta aviso de ocupação dos volumes compartilhados `/home1` e
  `/home2`. Solicitar avaliação à HostGator antes de criar arquivos grandes
  no servidor; não confundir isso com a cota individual da conta.
- Não foi executado backup real, upload, restauração, mudança de permissões,
  criação de cron, merge nem deploy durante a inspeção.
