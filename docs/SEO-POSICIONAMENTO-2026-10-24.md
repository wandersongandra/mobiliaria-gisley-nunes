# SEO e posicionamento — Gisley Nunes Imóveis

Data da rodada: 2026-10-24  
Escopo: intenção de busca, conteúdo visível, metadados, indexação e descoberta.

## Limite da evidência

Esta rodada não acessou dados de impressões, cliques, posições ou conversões do
Google Search Console/Analytics. Portanto, o mapa abaixo é uma estratégia de
relevância baseada no conteúdo e na atuação informada pelo próprio site; não é
uma promessa de volume, posição ou tráfego.

O site informa atuação em Belo Horizonte e região, compra, locação e anúncio de
imóveis. Bairros e páginas de imóveis só devem ganhar páginas indexáveis quando
existirem registros publicados que sustentem o conteúdo.

## Mapa de intenção

| Intenção | Termos prioritários | Página de destino | Condição |
| --- | --- | --- | --- |
| Marca/local | Gisley Nunes Imóveis; imobiliária em Belo Horizonte | `/`, `/sobre`, `/contato` | Conteúdo institucional e NAP verdadeiros |
| Compra | imóveis à venda em Belo Horizonte; comprar imóvel em Belo Horizonte | `/imoveis` | Indexável somente com catálogo publicado |
| Locação | imóveis para alugar em Belo Horizonte; alugar imóvel em Belo Horizonte | `/imoveis` com filtro | Filtros permanecem `noindex`; publicar landing dedicada apenas se houver inventário e conteúdo próprio |
| Serviço | serviços imobiliários em Belo Horizonte; anunciar imóvel em Belo Horizonte | `/servicos` | A página descreve apenas serviços efetivamente oferecidos |
| Localização | imóveis por bairro em Belo Horizonte; imóveis em `<bairro>` | `/bairros`, `/bairros/<slug>` | Diretório com inventário; bairro indexável a partir de 3 imóveis publicados |
| Imóvel | `<tipo>`, finalidade, bairro, cidade e características reais | `/imoveis/<slug>` | Página publicada, com capa, preço/condição e descrição verificáveis |

## Regras editoriais

1. Usar a intenção principal uma vez no `title`, no `h1` e na descrição
   introdutória; escrever para a pessoa, sem repetição artificial.
2. Manter bairro, tipo, finalidade, preço, área e quartos sincronizados com o
   cadastro real. Não criar páginas para bairros sem inventário.
3. Não adicionar `meta keywords`: esse campo não é usado pelo Google para
   classificação e tende a criar falsa sensação de cobertura.
4. Não publicar depoimentos, CRECI, endereço, avaliações ou diferenciais que
   não tenham fonte operacional verificável.
5. Não usar fotos de referência como se fossem fotos do imóvel anunciado.
   Imóveis publicados devem ter mídia local registrada e texto alternativo
   descritivo.

## Alterações desta rodada

- títulos e descrições alinhados a “imóveis à venda”, “imóveis para alugar”,
  “imobiliária em Belo Horizonte” e “imóveis por bairro”;
- `h1` e trechos introdutórios das páginas públicas reforçados com a intenção
  local, sem alterar a proposta comercial;
- `/imoveis` e `/bairros` ficam `noindex,follow` quando o catálogo está vazio;
- URLs de catálogo/diretório vazias deixam de entrar no `sitemap.xml`;
- preview Node/EJS, templates Laravel e testes mantêm o mesmo contrato;
- teste de regressão impede o retorno de `meta keywords` e a indexação de
  páginas de catálogo sem conteúdo.

## Próxima medição operacional

Depois de publicar imóveis reais e validar a propriedade no Search Console,
acompanhar por pelo menos 28 dias:

- consultas e páginas que geram impressões;
- CTR por título/descrição;
- cobertura e exclusões por `noindex`, canonical e sitemap;
- cliques em contato/WhatsApp e leads por finalidade;
- desempenho por bairro somente quando houver inventário suficiente.

Se uma intenção não aparecer nos dados, revisar título, conteúdo e links
internos antes de ampliar o número de páginas. Não criar dezenas de páginas
quase idênticas para tentar capturar variações de palavra-chave.
