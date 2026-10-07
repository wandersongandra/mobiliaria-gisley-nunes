# Frontend: source of truth e artefatos

Este projeto possui dois runtimes distintos: Laravel/PHP é o runtime de
produção e Node/Vite é usado para build, testes e preview. A regra desta fase
é que nenhum artefato público seja editado manualmente quando existir uma
fonte correspondente.

## Matriz de responsabilidade

| Path | Tipo | Source of truth? | Generated? | Runtime | Legacy? | Build input? | Build output? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/` | JavaScript/CSS público | Sim, para assets públicos | Não | Vite, navegador via artefato Laravel | Não | Sim | Não |
| `admin/` | Shell e assets do painel | Sim, para o painel | Não | Vite/cópia, navegador via Laravel | Não | Sim | Não |
| `resources/views/` | Templates Blade | Sim, para Laravel | Não | Laravel/PHP | Não | Não | Não |
| `public/assets/` | JS/CSS servido pelo Laravel | Não | Sim | Laravel/Apache/PHP-FPM | Não | Não | Sim |
| `public/admin/` | HTML/JS/CSS servido pelo Laravel | Não | Sim | Laravel/Apache/PHP-FPM | Não | Não | Sim |
| `views/` | Templates EJS do preview Node | Sim, somente para preview | Não | Node/Express e preview estático | Não | Sim | Não |
| `server/` | API e runtime Node | Sim, somente para Node/preview/testes | Não | Node/Express | Parcial: fora da produção Laravel | Sim | Não |
| `scripts/build-public-assets.mjs` | Orquestrador de assets Laravel | Sim, para o processo de build | Não | Node durante o build | Não | Sim | Não |
| `scripts/build-pages-preview.mjs` | Orquestrador de preview | Sim, para o preview | Não | Node durante o build | Não | Sim | Não |
| `dist/` | Saída intermediária Vite | Não | Sim | Não | Não | Não | Sim |
| `dist-preview/` | Saída do preview | Não | Sim | Cloudflare preview, quando publicado | Não | Não | Sim |

## Fluxo oficial

```text
src/main.js + src/styles.css + src/refinements.css
                         ↓ Vite
              public/assets/main.js + main.css

admin/index.html + admin/main.js + admin/*.css
                         ↓ sincronização determinística
              public/admin/*

resources/views/*.blade.php → Laravel em produção
views/*.ejs + server/* → Node/preview/testes
```

`public/assets` e `public/admin` são artefatos versionados porque o runtime
Laravel da HostGator não depende de Node. Eles são, entretanto, sobrescritos
exclusivamente pelo build e devem ser tratados como somente leitura no fluxo
de desenvolvimento.

## Evidência do drift corrigido

Antes da migração de fonte, a comparação mostrou diferenças materiais:

- `src/main.js` e `public/assets/main.js`: 71 inserções e 33 remoções;
- `admin/main.js` e `public/admin/main.js`: 362 inserções e 57 remoções;
- `admin/index.html` e `public/admin/index.html`: o artefato ativo tinha
  filtros/paginação e limites de formulário ausentes na fonte;
- `admin/refinements.css` e o artefato público também divergiam.

O conteúdo ativo foi promovido para as fontes `src/` e `admin/`, e o build
passou a gerar os artefatos públicos. A API Node recebeu o contrato v2 usado
pela fonte do catálogo; Blade continua sendo a fonte de templates do Laravel.

## Guardas contra regressão

Use, nesta ordem, a partir de um checkout limpo:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm test:source
pnpm build:preview
pnpm test:browser
pnpm test
```

`pnpm test:source` compara byte a byte os arquivos do painel e compara o
manifesto Vite com `public/assets`. O workflow de CI executa esse guard após o
build. O resultado esperado é nenhuma diferença inesperada no `git diff` dos
artefatos gerados.

`pnpm test:browser` sobe um servidor estático isolado sobre `dist-preview` e
valida responsividade, overflow horizontal, axe, teclado, menu mobile,
filtros, galeria, reduced motion e a página 404. O teste não substitui a
validação do runtime Laravel nem a medição de Core Web Vitals em ambiente
publicado.

O CSP permanece estrito por padrão também fora de produção. Se uma sessão
local usar Vite HMR, a exceção deve ser opt-in e limitada ao desenvolvimento:

```text
$env:GISELY_DEV_HMR_CSP = 'true'
```

Esse modo adiciona somente as origens locais e websocket necessárias ao HMR e
`style-src 'unsafe-inline'`; não deve ser habilitado em produção.

Alterações futuras devem seguir esta sequência:

1. editar `src/`, `admin/` ou `resources/views/` conforme o runtime;
2. executar `pnpm build`;
3. executar `pnpm test:source`;
4. executar os testes relacionados e o preview;
5. revisar o diff, incluindo o artefato público gerado.

Não corrigir diretamente `public/assets` ou `public/admin` sem alterar a fonte
correspondente. Se o comportamento existir apenas no preview, ele deve ser
identificado como preview-only; não deve ser tratado como comportamento de
produção Laravel.

## Classificação do legado Node

`server/` e `views/` não são dependências do runtime PHP, mas ainda são
`ACTIVE` no fluxo de preview/testes e `BUILD INPUT` para `dist-preview`.
Portanto não são código morto e não devem ser removidos nesta fase. A
remoção futura exige migrar ou eliminar explicitamente seus consumidores e
manter o contrato público v2 coberto por testes.
