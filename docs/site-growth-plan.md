# Plano de evolução — Gisley Nunes Imóveis

Atualizado em 2026-10-02. Este documento organiza a evolução do site público e separa o que já foi implementado do que depende de conteúdo, hospedagem do backend ou configuração de negócio.

## Objetivo

Fazer o site ser encontrado por pessoas que procuram imóveis em Belo Horizonte e região, transformar essa visita em uma conversa qualificada e manter o catálogo administrável com segurança.

## Mapa do site

```text
/
├── /imoveis                         catálogo com filtros
│   └── /imoveis/:slug               detalhe público do imóvel
├── /bairros                         diretório de localizações publicadas
│   └── /bairros/:slug               catálogo local derivado dos imóveis publicados
├── /servicos                        comprar, alugar e anunciar
├── /sobre                           posicionamento e forma de trabalho
├── /contato                         formulário e canais diretos
├── /privacidade                     política de privacidade
├── /sitemap.xml                     URLs indexáveis
├── /robots.txt                      regras para rastreadores
└── /llms.txt                        resumo legível por agentes e buscadores
```

O CRM permanece separado em `/admin` e nas APIs administrativas. Ele não entra no sitemap e continua protegido pela Camada 1 de segurança.

## Arquitetura pública

- Express e EJS entregam HTML inicial com metadados, links e conteúdo essencial.
- Vite entrega o JavaScript de interação, filtros, galeria e formulário.
- `server/catalog.js` concentra a derivação de bairros para evitar regras duplicadas entre páginas, sitemap e `llms.txt`.
- `views/partials/property-card.ejs` mantém o cartão server-rendered reutilizável nas páginas locais.
- O catálogo local usa somente imóveis publicados retornados pelo banco; bairros não são inventados e desaparecem da indexação quando deixam de ter imóveis publicados.
- O preview estático usa os mesmos templates e dados demonstrativos, incluindo as novas páginas, para facilitar revisão no Cloudflare; também materializa `robots.txt`, `sitemap.xml` e `llms.txt` para validar a superfície pública completa.

## SEO técnico implementado

- Títulos, descrições, canonical e Open Graph por página.
- `WebSite` e `RealEstateAgent` globais.
- `BreadcrumbList` em serviços e páginas locais.
- `CollectionPage` e `ItemList` no diretório de bairros e nas páginas de bairro.
- Sitemap com páginas institucionais, bairros publicados e imóveis publicados.
- `robots.txt` bloqueia APIs, CRM e endpoints operacionais.
- `llms.txt` lista páginas, bairros e imóveis atuais.
- Conteúdo essencial das páginas de bairro é renderizado no HTML inicial; o JavaScript continua sendo um aprimoramento.

## Conversão e UX

- Navegação principal agora apresenta catálogo, bairros e serviços.
- A home oferece três caminhos claros: comprar/alugar, buscar por bairro e conhecer os serviços.
- Links com `?purpose=Alugar` preenchem o filtro de locação automaticamente.
- Cada página de bairro termina com um CTA para criar uma busca quando a seleção atual não atender ao visitante.
- Formulário e WhatsApp continuam com o fluxo existente e sem alteração de contrato da API.

## Conteúdo que precisa de decisão humana

- Definir a área exata de atendimento e revisar a descrição comercial no painel.
- Preencher CRECI, Instagram e dados de contato reais quando estiverem confirmados.
- Substituir imagens de referência por fotos próprias licenciadas antes do lançamento comercial.
- Adicionar depoimentos somente com autorização e identificação correta.
- Criar textos específicos de bairros somente quando houver experiência e inventário suficiente para sustentar a página.

## Próximas medições

1. Cadastrar o domínio canônico no Google Search Console e enviar o sitemap.
2. Medir LCP, INP e CLS em celular e desktop com dados de campo após o site receber tráfego.
3. Medir cliques em catálogo, bairros, WhatsApp e envio do formulário.
4. Comparar páginas de entrada, consultas orgânicas e leads por intenção.
5. Revisar bairros e imóveis publicados antes de cada atualização do sitemap.

O plano não promete posição ou volume de leads. Ele organiza páginas rastreáveis, conteúdo verificável, navegação clara e medição para que o desempenho possa ser melhorado com evidência.
