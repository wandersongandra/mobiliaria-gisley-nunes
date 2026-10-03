# Revisão de mudanças locais — Fase 2

Base comparada: `origin/migration/laravel-backend-2026-10-02` (`f5974f5`). A revisão cobriu os 20 commits existentes antes do início da Fase 2. Não houve alteração não versionada além de `.playwright-cli/` e `output/`, que foram preservados.

| Commit | Intenção e arquivos | Efeito e risco de regressão | Teste/evidência |
| --- | --- | --- | --- |
| `db7eb75` | Aplicar nonce CSP em `home.blade.php`, `imovel.blade.php`, `partials/head.blade.php`. | Corrige bloqueio de scripts. Risco: nonce ausente em outro Blade. | `PublicPageRenderTest`. |
| `4e61ac0` | Isolar testes em SQLite: `config/database.php`, `phpunit.xml`, README. | Evita dependência local. Não prova semântica MySQL. | PHPUnit SQLite; MySQL local segue pendente. |
| `24c789d` | Mover cache público para `PropertyService`. | Invalidação passa a ser centralizada; a lista v1 ainda carrega o catálogo inteiro. | `PublicCatalogCacheTest`. |
| `9799951` | Extrair `AdminRequestContext` usado pelos controllers administrativos. | Reduz duplicação de autenticação, UUID e auditoria best-effort. | Testes de contrato e segurança. |
| `2afb580` | Centralizar relógio e tokens em `Clock` e `Tokens`. | Remove fontes de aleatoriedade/tempo divergentes. | `SupportPrimitivesTest`. |
| `18f9d921` | Separar `PublicController` em páginas, API, mídia e discovery. | Mudança de superfície HTTP; risco de rota esquecida. | `RouteSurfaceTest`. |
| `ebc8e592` | Reutilizar cache do catálogo em SSR/discovery. | Melhora leituras, mas mantém custo da carga completa v1. | `PublicCatalogCacheTest`. |
| `1182a30` | Centralizar limite de fotos e prefixo R2. | Evita constantes divergentes; não era constraint de banco. | Testes de propriedades e upload. |
| `1a1fbec` | Corrigir arquivo `config/gisely.php` para `config/gisley.php`. | Mantém nomes de ambiente legados; risco só se o deploy mantiver o arquivo removido em cache. | `AdminAccessConfigurationTest`. |
| `50aa616` | Exigir origem configurada em mutações. | Fecha Host-header/origin spoofing; depende de `APP_URL` e `ADMIN_ORIGIN` corretos. | `SecurityContractTest`. |
| `7ca3be0` | Conferir metadados e dimensões reais no R2. | Fecha MIME declarado/dimensões falsas; formatos e R2 reais precisam de prova externa. | `UploadLifecycleTest`. |
| `ac242d7` | Ajustar análise estática da inspeção de imagem. | Sem contrato público novo. | Larastan anterior; reexecução na Fase 2. |
| `5edbdf1` | Criar health live/ready. | `ready` mede DB, não R2/OAuth. | `BackendContractTest`. |
| `b28731f` | Auditar login/logout/logout-all. | Eventos ainda são best-effort; falha de auditoria não bloqueia ação. | `SecurityContractTest`. |
| `cdabbb9` | Endurecer headers e Apache. | CSP inclui estilo inline por compatibilidade; verificar no HostGator. | `PublicPageRenderTest`. |
| `451241e` | Incluir validação Composer no CI. | Gate correto, mas a evidência depende do run remoto. | Workflows revisados; Composer local executado na Fase 2. |
| `c2adcc3` | Documentar arquitetura, segurança e HostGator. | Documentação não é controle runtime. | Revisão manual. |
| `04f4e341` | Registrar health no snapshot de rotas. | Detecta remoção/renomeação de rota. | `RouteSurfaceTest`. |
| `3654ed1` | Correlation/request ID em middleware. | Entrada é restringida; header pode ser usado em logs sem PII adicional. | `BackendContractTest`. |
| `bb1e76f` | Registrar limitações conhecidas. | Não altera runtime. | Revisão manual. |

## Regressões encontradas nesta revisão

- **MEDIUM — ARCH-01:** `GET /api/properties` e páginas SSR ainda dependiam da lista total em cache. A Fase 2 acrescenta `GET /api/v2/properties` paginado, sem quebrar v1. A migração do consumidor público continua pendente de coordenação com o frontend.
- **HIGH — R2-02:** o limite de 20.000 pixels por lado permitia área de 400 milhões de pixels. Corrigido por `c70732a` com teto de 40 milhões de pixels e teste de regressão.
- **HIGH — DB-02:** uma única capa era apenas invariante de serviço. Corrigido por `e76a4c6` com coluna gerada e índice único.
- **MEDIUM — LEAD-03:** exportação carregava todos os leads em memória. Corrigido por `b0374ed` com cursor e streaming.

Os commits de correção da Fase 2 são analisados em `PHASE2-AUDIT.md`.
