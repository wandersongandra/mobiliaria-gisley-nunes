# Arquitetura do frontend

## Contrato de produção

O runtime Laravel serve os artefatos gerados em `public/assets` e
`public/admin`. As fontes canônicas são `src/` para o frontend público,
`admin/` para o painel e `resources/views/` para os templates Blade. Node não é
necessário para o runtime PHP na HostGator, mas é necessário no build e no
preview.

`pnpm build` é o único fluxo autorizado para atualizar os artefatos públicos.
`pnpm test:source` bloqueia drift byte a byte entre as fontes do painel, o
manifesto Vite e os arquivos servidos pelo Laravel. A matriz completa está em
[`FRONTEND-SOURCE-OF-TRUTH.md`](FRONTEND-SOURCE-OF-TRUTH.md).

## Superfícies ativas

- páginas públicas Blade + `public/assets/main.js`/`main.css` gerados de `src/`;
- painel em `public/admin/index.html`, `main.js` e CSS gerados de `admin/`;
- API pública v2 para catálogo, com estado de filtros/paginação na URL;
- admin com sessão server-side, CSRF, same-origin, capabilities e estados de
  carregamento/erro.

## Regras de manutenção

- escapar conteúdo dinâmico antes de renderizar HTML;
- usar `encodeURIComponent` para segmentos derivados de slug;
- manter `rel="noopener noreferrer"` em links externos com nova aba;
- evitar dependência de `localStorage` para identidade ou sessão;
- manter ações destrutivas com confirmação e feedback de erro;
- não substituir validação server-side por validação de navegador.
- não editar `public/assets` ou `public/admin` manualmente;
- validar `pnpm build`, `pnpm test:source` e `pnpm build:preview` antes de
  commitar mudanças de frontend.
