# Fase 8 — Frontend, design, mobile e UX

Data da rodada: 2026-10-05  
Branch: `migration/laravel-backend-2026-10-02`  
Base: `5a286fca8bccb473f12d5b1594ffe27e6c11b516`

## Resumo executivo

A rodada foi executada no build estático do frontend e em navegador real, com estados públicos alimentados por fixtures locais e painel administrativo aberto em instância local isolada. A identidade editorial existente foi preservada: verde profundo, cobre, creme/areia, Fraunces e Manrope.

Foram corrigidos problemas confirmados no painel, na galeria de imóveis, em acessibilidade, em imagens de catálogo e no breakpoint de 320px. O build continua determinístico e o guard de source of truth permanece verde.

## Findings e correções

| ID | Severidade | Componente | Evidência | Risco | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P8-UX-001 | MEDIUM | Admin hidden views | `hidden` era sobrescrito por `display`; login e views ocultas permaneciam no fluxo. | Página artificialmente alta e troca de telas inconsistente. | `[hidden]{display:none!important}` no refinamento do admin. | Login, dashboard e views; axe login/dashboard. | RESOLVIDO |
| P8-A11Y-001 | HIGH | Galeria, detalhe e contato | axe encontrou contrastes abaixo de 4.5:1, `aside` inadequado e controle aninhado. | Leitura ruim e navegação assistiva inconsistente. | Contraste corrigido, resumo virou contêiner semântico e abertura da galeria virou botão próprio. | axe-core: 0 violações nas páginas públicas e admin testadas. | RESOLVIDO |
| P8-MOBILE-001 | MEDIUM | Admin e contato | Sidebar de 215px no dashboard mobile e grid de contato excedendo 320px. | Overflow horizontal e perda de conteúdo em telas pequenas. | Sidebar passa a ocupar a largura disponível; filhos do grid podem encolher; e-mail quebra com segurança. | Matriz 320, 360, 375, 390, 414, 768, 1024, 1280, 1440 e 1920px sem overflow. | RESOLVIDO |
| P8-UX-002 | MEDIUM | Galeria do imóvel | Existiam setas, miniaturas e swipe, mas não havia visualização em tela cheia. | Fotos não eram confortáveis para inspeção no celular/desktop. | Dialog nativo com imagem, contador, anterior/próxima, ESC, clique no backdrop e retorno de foco. | Abertura, troca para foto 02, ESC e retorno ao gatilho. | RESOLVIDO |
| P8-PERF-001 | LOW | Cards de imóvel | Imagens não declaravam dimensões nem `sizes`. | Maior risco de CLS e escolha menos eficiente de recurso. | `width`, `height` e `sizes` na fonte Node, Blade e JS. | Build, source guard e smoke visual. | RESOLVIDO |
| P8-DEV-001 | INFO | Preview Node com Vite HMR | O servidor de desenvolvimento local registra bloqueios de websocket/HMR pela CSP estrita. | Ruído apenas no modo dev; não representa o build estático. | Não afrouxar CSP de produção; usar `dist-preview` para QA visual. | Preview estático sem console error nas páginas avaliadas. | DOCUMENTADO |

## Design e identidade

O design system foi consolidado em [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), incluindo cores, tipografia, raios, foco, movimento, componentes, responsividade, imagens e regra de source of truth. Não foi adicionado dark mode, dependência visual nova, gradiente decorativo ou efeito contínuo sem função.

As melhorias visuais foram incrementais: o catálogo manteve a composição editorial e filtros empilhados no celular; o detalhe ganhou CTA persistente no fluxo mobile; a galeria passou a ter uma abertura clara e acessível; o painel ganhou leitura semântica e melhor comportamento em telas estreitas.

## Evidência visual

Referências capturadas no navegador real:

- [Home desktop](../output/playwright/home-preview-data-desktop.png)
- [Catálogo desktop antes](../output/playwright/catalog-desktop-before.png)
- [Catálogo mobile antes](../output/playwright/catalog-mobile-before.png)
- [Detalhe desktop antes](../output/playwright/property-desktop-before.png)
- [Detalhe mobile depois](../output/playwright/property-mobile-after.png)
- [Galeria em tela cheia](../output/playwright/property-lightbox-desktop.png)
- [Login admin desktop](../output/playwright/admin-login-desktop.png)
- [Dashboard admin mobile final](../output/playwright/admin-dashboard-mobile-final.png)

Os arquivos de apoio de Playwright ficam em `output/playwright/` e não são artefatos de produção.

## Acessibilidade e interação

- axe-core: 0 violações em `/`, `/imoveis/`, detalhe, `/contato/` e `/404.html`.
- axe-core: 0 violações no login e no dashboard administrativo simulado.
- Menu mobile: foco inicial no primeiro link, ESC restaura foco e toque fora fecha.
- Galeria: botões com labels, contador live no estado principal, dialog nativo, ESC e retorno ao gatilho.
- `prefers-reduced-motion: reduce`: transições da imagem e comportamento de rolagem verificados como reduzidos.
- Foco visível preservado; não houve remoção global de outline.

## Performance visual

O build final gerou aproximadamente 73.36 kB de CSS e 20.63 kB de JS antes de gzip. O catálogo informa dimensões e `sizes`; a primeira foto do imóvel mantém `fetchpriority="high"`, enquanto miniaturas e cards secundários permanecem lazy. Não foi declarado PASS de Core Web Vitals de produção: não houve tráfego público real nesta fase.

## Testes executados

- `pnpm install --frozen-lockfile` — PASS
- `pnpm test` — 183 PASS, 1 skip opcional MySQL, 184 testes
- `pnpm build` — PASS
- `pnpm build:preview` — PASS, 19 páginas geradas
- `pnpm test:source` — PASS
- `pnpm audit --prod` — PASS, sem vulnerabilidades conhecidas
- `pnpm security:secrets` — PASS
- PHPUnit direto via `php vendor/bin/phpunit` — 108 testes / 582 assertions PASS
- Pint — PASS
- PHPStan — PASS, 0 erros
- Smoke Playwright público — 10 rotas, status 200, 0 console.error, 0 pageerror, 0 requestfailed
- axe-core — 0 violações nas páginas e estados listados acima
- Matriz visual — sem overflow após 300 ms de estabilização em 10 larguras
- Filtro de catálogo — URL state `purpose=Comprar` confirmado
- Galeria — abrir, trocar foto, fechar com ESC e devolver foco confirmados

Aviso de ambiente: o comando `composer` não está no PATH local. Os checks PHP foram executados diretamente pelos binários versionados em `vendor/bin`; o warning de extensão `pdo_informix` do PHP local não afetou os testes.

## Commits

- `abc639e admin: respect hidden views in the panel`
- `3633366 frontend: refine gallery and mobile experience`

## Gates

| Gate | Estado | Evidência |
| --- | --- | --- |
| DESIGN | PASS | screenshots e revisão visual página a página |
| MOBILE | PASS | 320–414px sem overflow e CTA do imóvel |
| TABLET | PASS | 768–1024px sem overflow |
| DESKTOP | PASS | 1280–1920px sem overflow e screenshots |
| ADMIN UX | PASS | login/dashboard mobile e correção de views ocultas |
| ACCESSIBILITY | PASS | axe-core 0 e teclado/ESC/foco verificados |
| PERFORMANCE LOCAL | PASS | build, dimensões de imagem e bundle registrados |
| SOURCE OF TRUTH | PASS | `pnpm test:source` |
| VISUAL REGRESSION | PASS | antes/depois no preview estático; sem regressão evidente |
| FRONTEND QUALITY | PASS | testes Node, build, auditoria, smoke e PHP regressão |

## Riscos residuais

- A aplicação pública ainda não foi testada em DNS/SSL/Cloudflare/R2/OAuth/HostGator nesta fase, por restrição explícita do escopo.
- O admin foi validado em login e dashboard com estado simulado; CRUD autenticado real depende dos provedores externos bloqueados.
- O HMR do servidor Node local conflita com a CSP estrita; isso é específico do modo dev. O preview de build usado no smoke não apresentou esses erros.
- Core Web Vitals reais continuam não verificados até existir tráfego público.

## Estado de publicação

HostGator não foi atualizado. DNS, Cloudflare, AutoSSL, R2, OAuth, `.env` remoto, deploy e `main` não foram alterados.
