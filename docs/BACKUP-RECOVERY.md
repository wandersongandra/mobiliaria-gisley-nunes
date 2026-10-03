# Backup e recuperação

Este procedimento é compatível com MySQL e Cloudflare R2 em hospedagem compartilhada. Execute comandos de produção apenas por um operador autorizado e fora do diretório público.

## Backup

1. Coloque a aplicação em manutenção durante mudanças de schema e registre o SHA implantado.
2. Exporte MySQL com `mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4`. Criptografe o arquivo e guarde-o fora da HostGator.
3. Versione o manifesto R2: lista de chaves, tamanho, data e checksum quando disponível. A política de retenção do bucket deve manter versões/backup independente para fotos registradas.
4. Guarde `.env` somente no cofre de segredos. Não inclua no dump nem no repositório.
5. Teste uma restauração em banco isolado antes de aceitar o backup como recuperável.

## Restauração

1. Crie banco MySQL vazio com charset `utf8mb4` e collation compatível.
2. Importe o dump, aplique `php artisan migrate --force` apenas se o histórico de migrations exigir e compare `php artisan migrate:status` com o SHA de origem.
3. Restaure objetos R2 somente sob o prefixo `gisley/properties/`; não restaure chaves arbitrárias nem sobrescreva objetos ativos sem inventário.
4. Rode `php artisan app:production-check`, `/health/live` e `/health/ready` depois de configurar o `.env`.
5. Faça login com conta autorizada, confira uma foto publicada e revise a trilha de auditoria antes de reabrir tráfego.

## Rollback e falha de migration

- Deploy: retorne ao SHA anterior e limpe/regenere caches Laravel. Não execute `migrate:rollback` automaticamente em produção.
- A migration de capa adiciona coluna gerada e índice único. Antes de aplicá-la, faça backup e valide em cópia do banco: dados antigos com mais de uma capa impedem a criação do índice e exigem correção explícita.
- Se uma migration falhar, mantenha manutenção, capture a mensagem sem secrets, restaure o dump ou aplique uma migration corretiva compatível. Não faça `DROP`/`TRUNCATE` como recuperação.

## RTO/RPO e responsabilidades

RTO/RPO não foram acordados nem medidos. Defina-os com a operação, registre o responsável pelo dump, local de armazenamento, período de retenção e data do último restore testado. O job `gisley:cleanup-orphaned-property-uploads` só remove objetos sem registro após 24 horas; ele não substitui backup R2.
