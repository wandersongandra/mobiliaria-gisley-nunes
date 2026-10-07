# Fase 5 — auditoria completa e melhoria

Data: 2026-10-05  
Branch: `migration/laravel-backend-2026-10-02`  
Base: `a808885c44ed875e472e3f8252a6376410cc7bae`

## 1. Resumo executivo

A rodada revalidou backend Laravel, frontend Vite/Node, painel administrativo,
rotas, controles de segurança, catálogo, responsividade e fluxo de build. O
backend passou PHPUnit, Pint, PHPStan, sintaxe PHP, boot e caches. O frontend
passou instalação congelada, build, preview, testes, auditoria de dependências
e scanner de secrets. O navegador real confirmou páginas públicas, health,
login do admin, menu móvel, filtros e ausência de erros de console.

Foram implementadas quatro correções pequenas: remoção de `style-src
'unsafe-inline'`, throttle específico para exportação de leads, confirmações
para ações destrutivas do painel e favicon do admin.

DNS, SSL/AutoSSL, Cloudflare, R2 real, OAuth real e deploy continuam fora do
escopo desta rodada e bloqueiam a prontidão de produção.

## 2. Baseline e escopo

- branch e SHA locais/remotos confirmados; worktree limpo no início;
- nenhum `.env` real ou secret versionado encontrado;
- PHP local: 8.2.29; aviso não bloqueante de extensão opcional `pdo_informix`
  ausente no ambiente Windows;
- Composer CLI não está instalado no PATH local; `composer validate` e
  `composer audit` locais ficaram BLOCKED por ferramenta, embora a evidência
  anterior de HostGator/CI registre ambos PASS;
- PHPUnit: 107 testes, 573 assertions;
- Pint: PASS; PHPStan: PASS; PHP syntax: 77 arquivos PASS;
- `route:list`, `config:cache`, `route:cache`, `view:cache`: PASS;
- `pnpm install --frozen-lockfile`: PASS;
- `pnpm build`, `pnpm build:preview`: PASS;
- `pnpm test`: 183 PASS, 0 FAIL, 1 SKIP;
- `pnpm audit --prod --audit-level=moderate`: PASS;
- `pnpm security:secrets`: PASS.

`php artisan app:production-check` foi executado sem alterar `.env` e ficou
FAIL no checkout local por ausência deliberada de `APP_KEY`, HTTPS canônico,
credenciais MySQL, R2, OAuth e CIDRs de proxy. Isso é evidência do ambiente
local incompleto, não uma tentativa de mascarar o estado externo da
HostGator; nenhum valor secreto foi impresso.

## 3. Findings

| ID | Severidade | Componente | Evidência | Risco | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P5-SEC-001 | MEDIUM | CSP | `style-src` permitia `unsafe-inline` sem inline style necessário no HTML ativo | ampliava a superfície de injeção de estilo | removido no middleware; teste impede regressão | PHPUnit + curl do header + smoke Playwright | RESOLVIDO |
| P5-SEC-002 | MEDIUM | export CRM | `/api/admin/leads/export` usava somente throttle administrativo geral | extração repetida de dados pessoais | `throttle:export`, 20/10 min/IP, preservando capability | RouteSurfaceTest + PHPUnit | RESOLVIDO |
| P5-ADMIN-001 | LOW | painel admin | remoção de foto, depoimento, membro, convite e troca de papel não pediam confirmação | clique acidental em operação destrutiva | confirmações explícitas no artefato ativo e fonte de preview | `node --check`; revisão de diff | RESOLVIDO |
| P5-ADMIN-002 | LOW | painel admin | `/favicon.ico` retornava 404 no smoke browser | ruído de console e acabamento incompleto | favicon aponta para logo existente; fonte e artefato atualizados | GET 200 + console Playwright sem erro | RESOLVIDO |
| P5-MAINT-001 | MEDIUM | frontend híbrido | `public/` é o artefato Laravel ativo, enquanto `src/`/`admin/` alimentam preview e estão defasados em partes | correção futura pode ser feita no arquivo que não chega à produção | contrato documentado; remoção/sincronização ampla exige migração dedicada | build, syntax checks e inspeção de histórico | ABERTO CONTROLADO |
| P5-PERF-001 | INFO | performance externa | não há medição de LCP/CLS/INP contra origem pública durante propagação | não permite afirmar CWV de produção | medir após DNS/SSL/R2 e imagens reais | etapa operacional futura | NÃO VERIFICADO |

## 4. Segurança backend

Rotas administrativas exigem same-origin, sessão, CSRF quando aplicável,
`RequireAdmin`, capability e throttle. OAuth usa state/challenge e identidade
por subject; sessões são server-side e revogáveis. Uploads têm inspeção de MIME,
dimensões, tamanho e limite de pixels no objeto real. Auditoria crítica é
transacional e os logs possuem proteção append-only. A revisão não encontrou
rota administrativa pública nem segredo no repositório.

O CSP usa nonce em scripts, `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'` e agora não aceita `style-src 'unsafe-inline'`.

## 5. Arquitetura backend

O fluxo ativo é `routes -> middleware -> controllers -> services -> Query
Builder/MySQL/R2`. `PropertyService` e `CrmService` concentram domínio e acesso
ao banco; não foi introduzida abstração cosmética. `/api/v2/properties` é o
contrato usado pelo frontend atual. A v1 permanece depreciada por
compatibilidade e não foi removida sem inventário de consumidores.

## 6. Banco e integridade

As migrations e testes cobrem FK, índices, unicidade, sessão, convites,
propriedades, fotos, leads e auditoria. A rodada não alterou migration já
executada, não executou operação destrutiva e não mudou banco de produção.
Testes de upload/capa, convite one-time, sessão revogada, permissões e rollback
de auditoria permanecem verdes.

## 7. Segurança frontend

Os sinks dinâmicos revisados usam escaping, JSON seguro ou URLs derivadas de
slug/rotas controladas. Links externos com nova aba usam `noopener`; não foram
encontrados handlers inline, `javascript:` ou dependência de credencial em
`localStorage`. O painel envia CSRF e credenciais same-origin.

## 8. Frontend, design e UX

O frontend ativo é editorial, com verde profundo, cobre, creme/areia, Fraunces
e Manrope. A revisão preservou a identidade e corrigiu somente segurança,
confirmações administrativas e favicon. Home, catálogo vazio, filtros,
formulário e login do painel foram inspecionados no navegador.

## 9. Admin

O painel possui login separado, sessão, dashboard, CRUD, fotos, leads, equipe,
convites, site, depoimentos e auditoria. Estados de carregamento/erro existem
no artefato ativo. A confirmação adicionada cobre as ações destrutivas que
antes dependiam apenas do clique.

## 10. Mobile e acessibilidade

Playwright verificou o catálogo nas larguras 320, 360, 375, 390, 414, 768 e
1024 px sem overflow horizontal. O menu móvel foi aberto e fechado por
interação de teclado/controle, filtros alteraram URL e não houve erro de
console. Permanecem revisão manual com leitor de tela e medição automatizada de
contraste como pendências honestas.

## 11. Performance e imagens

Catálogo é paginado, filtros têm limites e imagens usam lazy loading/decoding
assíncrono quando não são críticas. Hero e galeria principal priorizam a
imagem. CWV real não foi declarado PASS porque a origem pública está bloqueada
por propagação externa.

## 12. SEO, sitemap e structured data

Páginas públicas têm title, description, canonical, sitemap e llms.txt; rotas
administrativas/API não entram no sitemap. JSON-LD é gerado pelo backend para
Organization/RealEstateAgent, WebSite, BreadcrumbList e conteúdo de imóvel
apenas quando há dados reais. Não foram inventados ratings, prêmios ou
endereços.

## 13. Dependências e supply chain

Frontend passou `pnpm audit` de produção. Workflows usam `permissions: contents:
read`, actions fixadas por SHA, deploy gated, SHA imutável e host-key checking
estrito. `HOSTGATOR_DEPLOY_ENABLED` permanece falso. Composer local ficou sem
execução por ausência do binário, não por falha do projeto.

## 14. Legacy cleanup

`public/assets`, `public/admin` = ACTIVE em Laravel. `src`, `admin`, `server` =
BUILD-ONLY/LEGACY conforme o fluxo de preview Node. Nenhum arquivo foi apagado
porque a equivalência entre artefato ativo e preview ainda não foi provada.

## 15. Testes adicionados e executados

Adicionados: asserção CSP sem `style-src 'unsafe-inline'`, contrato de throttle
dedicado do export e artefatos/admin com favicon e confirmação. Executados:
PHPUnit, Pint, PHPStan, PHP syntax, Node syntax, Vite build/preview, Node
tests, audit de dependências, secret scan, smoke Playwright e validação de
health local.

## 16. Gates

CRITICAL: 0  
HIGH: 0  
MEDIUM: 1 residual controlado (`P5-MAINT-001`)  
LOW: 0 residual  
INFO: 1 residual (`P5-PERF-001`)

BACKEND SECURITY GATE: PASS  
FRONTEND SECURITY GATE: PASS  
BACKEND QUALITY: PASS  
FRONTEND QUALITY: PASS  
ACCESSIBILITY: PASS COM ESCOPO LIMITADO  
PERFORMANCE: NÃO VERIFICADO EXTERNAMENTE  
SEO: PASS  
MOBILE: PASS  
ADMIN QUALITY: PASS COM TESTE AUTENTICADO EXTERNO PENDENTE  
PRODUCTION READINESS: BLOCKED — DNS/SSL/AutoSSL/R2/OAuth/Cloudflare/deploy
continuam bloqueados conforme escopo do usuário.

## 17. Commits

Commits pequenos realizados nesta branch:

- `d5e47a2 security: harden CSP and lead export throttling`;
- `958bf9f admin: add destructive action confirmations and favicon`;
- `935d7d3 docs: publish phase five audit and engineering baselines`;
- `af47e76 test: format route security contract`.

## 18. Riscos residuais e próximas ações permitidas

1. Não ativar DNS, Cloudflare, AutoSSL, R2, OAuth ou deploy nesta rodada.
2. Após propagação, executar medição CWV, SSL sem `-k`, health público, R2 real
   e OAuth real com secrets fora do chat.
3. Fazer uma migração dedicada para reduzir o drift entre fontes Node e
   artefatos PHP, com diff visual e rollback; não apagar `src/`, `admin/` ou
   `server/` por suposição.
