# Acessibilidade

## Controles atuais

- skip link e landmarks semânticos nas páginas públicas;
- labels associados a filtros e formulários;
- foco visível global e navegação do menu móvel por teclado/Escape;
- `aria-live` para resumo de filtros, paginação, status e mensagens do painel;
- textos alternativos em logos, hero e cartões de imóveis;
- `prefers-reduced-motion` reduz transições/animações;
- links externos do painel usam `rel="noopener"`.

## Evidência desta rodada

Playwright verificou home, login do painel e catálogo em navegador real. O
catálogo não apresentou overflow nas larguras 320, 360, 375, 390, 414, 768 e
1024 px; filtros alteraram a URL e o console não registrou erros.

## Limites

Ainda é necessária revisão manual com leitor de tela, contraste medido por
ferramenta automatizada e teste autenticado completo do painel. Essas lacunas
não são mascaradas como validação WCAG jurídica.
