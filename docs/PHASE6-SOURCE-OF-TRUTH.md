# Fase 6 — source of truth e runtime frontend

Data da rodada: 2026-10-05  
Branch: `migration/laravel-backend-2026-10-02`  
Base: `c02f83d`

## Resumo executivo

A Fase 6 atacou o risco estrutural P5-MAINT-001: o artefato servido pelo
Laravel estava mais avançado que as fontes Node/Vite e do painel. A fonte ativa
foi promovida para `src/` e `admin/`, o build passou a sincronizar os artefatos
Laravel de forma determinística e o CI ganhou um guard byte a byte.

O runtime de produção continua sendo Laravel/PHP. `server/` e `views/` foram
mantidos porque ainda são consumidores ativos do preview Node, testes e build
estático; não há base segura para removê-los nesta fase.

## Findings

| ID | Severidade | Componente | Evidência | Risco | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P6-DRIFT-001 | MEDIUM | `src/`, `admin/`, `public/` | `src/main.js` divergia do `public/assets/main.js` em 71 inserções/33 remoções; `admin/main.js` em 362 inserções/57 remoções | correção em fonte podia não chegar ao Laravel ou ser sobrescrita | fontes canônicas promovidas; `scripts/build-public-assets.mjs` gera `public/assets` e `public/admin` | `pnpm build`, `pnpm test:source`, `git diff --check` | RESOLVIDO |
| P6-CONTRACT-001 | MEDIUM | Node preview/API | fonte pública usava `/api/v2/properties`, mas Node só expunha o contrato v1 | preview e testes Node poderiam apresentar comportamento diferente do Laravel | rota v2 Node, validação fechada, filtros, facets e paginação; fixture v2 no preview | `node --test test/routes.test.js`, `pnpm build:preview` | RESOLVIDO |
| P6-A11Y-001 | MEDIUM | frontend/admin | axe-core encontrou contraste abaixo de AA e conteúdo fora de landmark | leitura menos acessível e falha WCAG comum | tokens/estados com contraste AA, landmark de login e atalho WhatsApp dentro do rodapé | axe-core home, catálogo, contato e admin: 0 violações | RESOLVIDO |
| P5-PERF-001 | INFO | frontend | bundle público continua sendo um artefato versionado para o runtime PHP | custo de manutenção e cache sem pipeline de fingerprint Laravel completo | mantida sincronização determinística; otimização adicional depende de decisão de deploy/cache | build e revisão de artefatos | RESIDUAL |

## Mapa final

Detalhes completos, classificação `ACTIVE`/`BUILD INPUT`/`PREVIEW ONLY` e
fluxos oficiais estão em [`FRONTEND-SOURCE-OF-TRUTH.md`](FRONTEND-SOURCE-OF-TRUTH.md).

Resumo operacional:

- `src/`: fonte do JavaScript/CSS público;
- `admin/`: fonte do HTML/JavaScript/CSS do painel;
- `resources/views/`: fonte dos templates Blade ativos no Laravel;
- `public/assets/` e `public/admin/`: artefatos gerados e servidos pelo PHP;
- `views/` e `server/`: ativos no preview Node/testes, mas fora do runtime PHP;
- `dist/` e `dist-preview/`: saídas geradas, não fontes.

## Integridade do build

O fluxo determinístico validado foi:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm test:source
pnpm build:preview
pnpm test
```

O guard compara os arquivos do painel byte a byte e compara o manifesto Vite
com os artefatos em `public/assets`. O CI executa o mesmo guard depois do
build. A alteração de CSS/JS é sempre feita na fonte e regenerada para o
Laravel.

## Segurança e CSP

Não foi reintroduzido `style-src 'unsafe-inline'`. A varredura das páginas
locais verificou carregamento de CSS/JS, API v2, página 404, admin sem sessão,
health e ausência de erro de console no navegador. Nenhum segredo foi usado ou
impresso.

## Banco e produção PHP

Foi executado um banco SQLite temporário somente para validar o runtime Laravel
sem Node, com migrations atuais e um fixture local não versionado. A aplicação
renderizou páginas públicas, catálogo filtrado, detalhe de imóvel, bairros,
contato, privacidade, 404, admin e health. O fixture e o banco temporário foram
removidos após a validação.

Isso não substitui a validação HostGator/MySQL/R2/OAuth/SSL. Os blockers
externos da Fase 5 permanecem: DNS/SSL/AutoSSL, R2, OAuth, Cloudflare e
habilitação do deploy.

## E2E e acessibilidade executados

- navegador real em home, catálogo, detalhe com fixture, bairros, serviços,
  sobre, contato, privacidade, 404 e `/admin`;
- filtro `Comprar` + `3 quartos`, atualização da URL e paginação;
- sem overflow horizontal em 320, 360, 375, 390, 414, 768 e 1024 px;
- sem `console.error`, `pageerror` ou request crítico falhando no smoke final;
- axe-core 4.13.0: 0 violações em home, catálogo, contato e admin;
- `rel="noopener noreferrer"` e CSP permaneceram preservados.

## Gates

```text
SOURCE-OF-TRUTH: PASS
BUILD DETERMINÍSTICO: PASS
NODE PREVIEW CONTRACT: PASS
LARAVEL WITHOUT NODE: PASS (local SQLite)
ACCESSIBILITY AUTOMATED SCOPE: PASS
MOBILE OVERFLOW: PASS
PRODUCTION READINESS: BLOCKED_EXTERNALLY
```

Production Readiness não é marcado como PASS porque esta rodada não alterou e
não validou DNS, SSL/AutoSSL, Cloudflare, R2, OAuth ou deploy HostGator real.
