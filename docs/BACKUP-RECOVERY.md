# Backup e recuperação

Este procedimento é compatível com MySQL e o diretório privado `MEDIA_ROOT` em hospedagem compartilhada. Execute comandos de produção apenas por um operador autorizado e fora do diretório público.

## Backup

1. Coloque a aplicação em manutenção durante mudanças de schema e registre o SHA implantado.
2. Exporte MySQL com `mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4`. Criptografe o arquivo e guarde-o fora da HostGator.
3. Faça uma cópia do diretório `MEDIA_ROOT`, preservando caminhos, tamanho, data e checksum quando disponível. A política de retenção deve manter cópia independente das fotos registradas.
4. Guarde `.env` somente no cofre de segredos. Não inclua no dump nem no repositório.
5. Teste uma restauração em banco isolado antes de aceitar o backup como recuperável.

## Restauração

1. Crie banco MySQL vazio com charset `utf8mb4` e collation compatível.
2. Importe o dump, aplique `php artisan migrate --force` apenas se o histórico de migrations exigir e compare `php artisan migrate:status` com o SHA de origem.
3. Restaure arquivos somente sob o prefixo `gisley/properties/`; não restaure caminhos arbitrários nem sobrescreva arquivos ativos sem inventário.
4. Rode `php artisan app:production-check`, `/health/live` e `/health/ready` depois de configurar o `.env`.
5. Faça login com conta autorizada, confira uma foto publicada e revise a trilha de auditoria antes de reabrir tráfego.

## Rollback e falha de migration

- Deploy: retorne ao SHA anterior e limpe/regenere caches Laravel. Não execute `migrate:rollback` automaticamente em produção.
- A migration de capa adiciona coluna gerada e índice único. Antes de aplicá-la, faça backup e valide em cópia do banco: dados antigos com mais de uma capa impedem a criação do índice e exigem correção explícita.
- Se uma migration falhar, mantenha manutenção, capture a mensagem sem secrets, restaure o dump ou aplique uma migration corretiva compatível. Não faça `DROP`/`TRUNCATE` como recuperação.

## Runbook executável de rollback

Este runbook é para homologação e operação autorizada. Não foi executado contra
produção nesta PR.

1. **Condição para interromper:** interrompa a publicação se qualquer gate de
   PHP-FPM, `app:production-check`, health check, migração, headers, login ou
   consistência R2/banco falhar. Preserve o log sanitizado, o SHA solicitado e
   o request ID; nunca copie secrets para a evidência.
2. **Identificação da versão anterior:** leia `previous_sha` em
   `.deploy-state`, confirme que ele é um commit existente no repositório remoto
   e registre também o SHA efetivamente servido no health/artefato. Se o estado
   estiver ausente ou inconsistente, pare e faça investigação manual.
3. **Compatibilidade de migrations:** compare `php artisan migrate:status` com
   o SHA anterior. Só reverta o código se as migrations forem compatíveis com
   ambos os releases; não use `migrate:rollback` automático para desfazer dados.
   Se o schema já avançou, use uma migration corretiva reversível após validação
   em banco isolado.
4. **Reversão:** em staging, retorne ao SHA anterior, reinstale dependências
   sem desenvolvimento, regenere caches Laravel e reaponte somente o ambiente
   alvo. Não execute `git reset --hard`, force push ou comando equivalente no
   repositório de trabalho do operador.
5. **Verificação pós-reversão:** confirme `app:production-check`, `/health/live`,
   `/health/ready`, headers de segurança, login/logout, uma leitura autorizada
   de mídia e a ausência de objetos órfãos criados pelo release. Compare counts,
   chaves R2 e registros do banco sem expor conteúdo sensível.
6. **Responsáveis e evidências:** o operador de release executa e registra os
   comandos; o responsável pelo banco aprova schema/dump; o responsável por
   storage confirma o prefixo R2; o revisor de segurança aprova os resultados.
   A evidência mínima é SHA anterior/novo, horário UTC, exit codes, health,
   `migrate:status`, manifesto R2, resultado do restore isolado e decisão de
   reabertura. Nenhum desses responsáveis ou restore de produção foi verificado
   nesta sessão.

## RTO/RPO e responsabilidades

RTO/RPO não foram acordados nem medidos. Defina-os com a operação, registre o responsável pelo dump, local de armazenamento, período de retenção e data do último restore testado. O job `gisley:cleanup-orphaned-property-uploads` só remove arquivos sem registro após 24 horas; ele não substitui backup.
