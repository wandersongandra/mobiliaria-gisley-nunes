# Painel comercial — lote de melhorias de 07/11/2026

## Escopo implementado no código

- Agenda de retornos vencidos, do dia e dos próximos 7 dias, com abertura do atendimento.
- Indicadores de contatos dos últimos 30 dias, fechamentos, conversão e tempo até primeira interação humana registrada (ligação, e-mail, WhatsApp ou reunião). A ausência de histórico mostra `—`, nunca `0 min` fictício.
- Caixa de avisos persistentes por usuário para leads novos (gestores) e retornos pendentes (responsável ativo, ou gestores quando não atribuído). Leitura individual, consulta apenas por usuário autenticado, deduplicação diária e eliminação após 90 dias ou remoção do colaborador.
- Coluna comercial separada de `status`: `available`, `reserved`, `sold`, `rented`. Reservados continuam identificados na vitrine; vendidos/alugados saem da vitrine pública e das rotas por slug, mas são preservados no painel. Estados anteriores preservados por clientes antigos que não enviem `availability`.
- O acesso público a fotos através de `/media/{path}` também deixa de resolver arquivos de imóveis vendidos/alugados, preservando a leitura autenticada pelo painel.
- Respostas de mídia pública passam a exigir revalidação após 5 minutos (antes: cache imutável de 1 ano). Isso limita futuros caches obsoletos; cópias previamente armazenadas por clientes ou terceiros não podem ser revogadas retroativamente.
- Prévia interna do anúncio, sem publicação, com dados do formulário e foto de capa.
- Editor visual de modelos de formulários e prévia de campos; o JSON avançado continua disponível e não é executado como código. Limites e tipos de campos validados no backend.
- Revisão da equipe com último login e alerta informativo de acessos inativos há mais de 90 dias. Nenhuma revogação automática.
- Validação e foco nos campos de maior impacto durante o cadastro de imóveis.
- Aviso externo de alertas de segurança e resumo de retornos por SMTP, **opcional** e sem dados pessoais; deduplicação do monitor por hora e dos lembretes por dia.

## Implantação controlada

1. Preservar backup privado do banco MySQL e da mídia antes de qualquer migração.
2. Homologar no staging com código e migrations `2026_11_07_000014` e `2026_11_07_000015`.
3. Executar `php artisan migrate --force`, `php artisan app:assert-migrations-current`, `php artisan app:production-check` e os testes PHP na mesma versão de PHP da HostGator.
4. Confirmar login real Google de gestor e editor, leitura isolada dos avisos, nova mensagem de contato, lembrete agendado, gravação das situações comerciais e que imóveis vendidos/alugados não apareçam no site público.
5. Confirmar visualmente desktop/tablet/mobile, com foco e mensagens de erro.
   O fluxo de CI inclui um smoke de interação com Chromium e API simulada, sem tocar em dados reais; a revisão visual humana do staging continua obrigatória.
6. Só então publicar/atualizar a versão de produção, executar smoke tests de páginas públicas e rotas administrativas, além de verificar o scheduler existente.

## Configuração de e-mail opcional

Só há entrega externa quando `MAIL_MAILER=smtp`, o destinatário é um e-mail válido e os dados SMTP estão configurados:

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=servidor-do-provedor
MAIL_PORT=587
MAIL_SCHEME=smtp
MAIL_USERNAME=usuario-configurado-no-servidor
MAIL_PASSWORD=segredo-fora-do-repositorio
MAIL_FROM_ADDRESS=conta-autorizada@dominio.exemplo
MAIL_FROM_NAME="Gisley Nunes Imóveis"
GISELY_SECURITY_ALERT_EMAIL=responsavel-autorizado@dominio.exemplo
GISELY_CRM_ALERT_EMAIL=responsavel-comercial@dominio.exemplo
```

Não definir e-mails fictícios em produção. A entrega deve ser testada com caixas reais e autorizadas, confirmando SPF/DKIM do domínio. Sem SMTP, os avisos internos continuam funcionando; o monitor registra no log os alertas detectados.

O scheduler da aplicação precisa continuar executando `php artisan schedule:run` a cada minuto. A rotina `gisley:crm-reminders` entra diariamente às 08:00, horário `America/Sao_Paulo`. O monitor de segurança permanece a cada hora.

## Privacidade e decisões de produto

- Notificações guardam apenas referência de lead, destinatário e tipo. Não enviamos nome, telefone, e-mail ou mensagem de cliente em alertas externos.
- Os formulários são modelos internos e **não** criam automaticamente formulários públicos ou coletam respostas. Publicar formulários específicos requer decidir quais dados serão coletados, finalidade, consentimento/retenção, destino e permissões de acesso.
- A atribuição de negócios como `fechado` é informativa, não prova receita. A taxa de fechamento representa a classificação dos leads recebidos nos últimos 30 dias, não negócios faturados.
- `Vendido` é aceito apenas para finalidade `Comprar`; `Alugado` apenas para `Alugar`.
- Não há remoção automática de usuários por inatividade. Gestores precisam confirmar legitimidade de cada acesso antes de revogar.

## Rollback e cuidados

Primeiro retornar a versão de aplicação anterior, **sem derrubar as colunas/tabelas novas**, pois as migrações têm efeitos aditivos e seus dados devem ser preservados. A retirada posterior das colunas/tabelas só deve ocorrer depois de backup e revisão de dados, em uma manutenção específica.

## Limites de verificação do lote

Na sessão que implementou estas mudanças, o executor local não tinha PHP/Composer; assim, a suíte Laravel e a aplicação real das migrations dependem da CI ou staging. Os checks JavaScript e o build verificam integração estática, mas não substituem esses testes. O lote não deve ser proclamado pronto para produção antes dessas validações.
