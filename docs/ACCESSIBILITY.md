# Acessibilidade

## Controles atuais

- skip link e landmarks semânticos nas páginas públicas;
- labels associados a filtros e formulários;
- foco visível global e navegação do menu móvel por teclado/Escape;
- `aria-live` para resumo de filtros, paginação, status e mensagens do painel;
- textos alternativos em logos, hero e cartões de imóveis;
- `prefers-reduced-motion` reduz transições/animações;
- links externos do painel usam `rel="noopener noreferrer"`;
- tokens de texto e estados auxiliares foram ajustados para contraste AA nas
  superfícies públicas e do painel.

## Evidência desta rodada

Playwright verificou home, login do painel, detalhe com fixture local e catálogo em navegador real. O
catálogo não apresentou overflow nas larguras 320, 360, 375, 390, 414, 768 e
1024 px; filtros alteraram a URL e o console não registrou erros. axe-core
4.13.0 encontrou 0 violações automatizáveis em home, catálogo, contato e
admin.

## Limites

Ainda é necessária revisão manual com leitor de tela e teste autenticado
completo do painel. Essas lacunas não são mascaradas como validação WCAG
jurídica; axe-core não substitui avaliação manual.
