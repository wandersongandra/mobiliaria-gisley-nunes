# Arquitetura do frontend

## Contrato de produção

O runtime Laravel serve os artefatos versionados em `public/assets` e
`public/admin`. `src/`, `admin/` e `server/` continuam no repositório para o
build/preview Vite, testes Node e compatibilidade da migração; Node não é
necessário para o runtime PHP na HostGator.

Essa separação é intencional, mas cria risco de drift entre fonte de preview e
artefato ativo. Qualquer mudança de interface pública ou painel precisa
atualizar o artefato em `public/`, executar `node --check` nos dois lados
quando aplicável e validar build/preview. Não remover essas pastas sem provar
que o fluxo de preview e os consumidores foram migrados.

## Superfícies ativas

- páginas públicas Blade + `public/assets/main.js`/`main.css`;
- painel em `public/admin/index.html`, `main.js` e CSS;
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
