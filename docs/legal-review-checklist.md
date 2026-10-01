# Checklist de revisão jurídica — Gisley Nunes Imóveis

Este arquivo reúne pontos que precisam ser confirmados antes da publicação comercial definitiva dos Termos de Uso e da Política de Privacidade.

Ele não substitui revisão jurídica profissional.

## Identificação da operação

Confirmar:

- nome empresarial ou nome civil do responsável pela operação;
- CPF/CNPJ, quando aplicável;
- endereço comercial;
- CRECI correto e forma de exibição;
- eventual razão social distinta de "Gisley Nunes Imóveis";
- canal oficial para solicitações de privacidade.

Não publicar dados não confirmados.

## Controlador e encarregado

Definir formalmente:

- quem é o controlador dos dados tratados pelo site/CRM;
- se haverá encarregado/DPO formalmente indicado;
- canal de contato do encarregado, se aplicável;
- procedimento interno para responder solicitações de titulares.

## Bases legais

Mapear, com apoio jurídico, as hipóteses legais adequadas para:

- resposta a contatos;
- agendamento de visitas;
- relacionamento pré-contratual;
- negociação;
- guarda de registros administrativos;
- segurança e prevenção de fraude;
- auditoria;
- obrigações legais/regulatórias.

Evitar usar consentimento como base genérica quando outra hipótese for mais adequada.

## Retenção

Definir prazos internos para:

- leads sem retorno;
- leads concluídos;
- registros de auditoria;
- sessões administrativas;
- cadastros de equipe desativados;
- documentos eventualmente anexados no futuro.

A política atual descreve retenção por necessidade/finalidade, mas o procedimento operacional deve estabelecer critérios objetivos.

## Cookies e tecnologias futuras

Na configuração atual:

- não há cookies de publicidade;
- não há analytics na área pública;
- cookies administrativos são técnicos/necessários.

Antes de adicionar Analytics, Meta Pixel, remarketing, chat de terceiros ou tecnologia equivalente:

1. revisar a base legal;
2. atualizar a política;
3. revisar necessidade de banner/gerenciador de preferências;
4. bloquear scripts não necessários antes da escolha do usuário quando aplicável.

## Fornecedores

Manter inventário atualizado de fornecedores que possam tratar dados, por exemplo:

- hospedagem;
- banco de dados;
- Cloudflare;
- R2;
- OAuth;
- e-mail;
- WhatsApp/Meta;
- monitoramento futuro.

Registrar finalidade e categoria de dado envolvida.

## Transferência internacional

Verificar se fornecedores utilizam infraestrutura fora do Brasil e documentar o mecanismo aplicável quando houver transferência internacional.

## Direitos dos titulares

Definir procedimento para:

- confirmação;
- acesso;
- correção;
- atualização;
- exclusão quando cabível;
- bloqueio/anonimização quando aplicável;
- informações sobre compartilhamento;
- autenticação segura do solicitante.

O CRM já possui uma ação de exclusão de dados de lead para Gestores.

## Imóveis e conteúdo

Revisar operacionalmente:

- autorização para publicar fotos;
- titularidade/licença das imagens;
- precisão de preço e disponibilidade;
- origem de metragem, condomínio, IPTU e características;
- procedimento de retirada de imóvel vendido/alugado;
- material de terceiros.

## Documentos legais do site

Arquivos atuais:

- `views/termos.ejs`
- `views/privacidade.ejs`

Revisar novamente quando houver mudança material em:

- dados coletados;
- fornecedores;
- cookies;
- analytics;
- canais de atendimento;
- autenticação;
- finalidade do CRM;
- integrações externas.

## Antes do go-live

- [ ] identidade jurídica confirmada;
- [ ] CRECI confirmado;
- [ ] controlador definido;
- [ ] contato de privacidade confirmado;
- [ ] bases legais revisadas;
- [ ] política de retenção definida;
- [ ] fornecedores inventariados;
- [ ] transferências internacionais avaliadas;
- [ ] Termos revisados;
- [ ] Privacidade revisada;
- [ ] links no rodapé validados;
- [ ] páginas `/termos` e `/privacidade` funcionando;
- [ ] sitemap atualizado;
- [ ] revisão jurídica final concluída.
