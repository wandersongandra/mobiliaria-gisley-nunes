# Frontend: source of truth e artefatos

Laravel/PHP é o runtime de produção. Node/Vite é usado somente para gerar os
assets estáticos; nenhum artefato público deve ser editado manualmente quando
existir uma fonte correspondente.

## Matriz de responsabilidade

| Path | Tipo | Source of truth? | Generated? | Runtime | Legacy? | Build input? | Build output? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/` | JavaScript/CSS público | Sim, para assets públicos | Não | Vite, navegador via artefato Laravel | Não | Sim | Não |
| `admin/` | Shell e assets do painel | Sim, para o painel | Não | Vite/cópia, navegador via Laravel | Não | Sim | Não |
| `resources/views/` | Templates Blade | Sim, para Laravel | Não | Laravel/PHP | Não | Não | Não |
| `public/assets/` | JS/CSS servido pelo Laravel | Não | Sim | Laravel/Apache/PHP-FPM | Não | Não | Sim |
| `public/admin/` | HTML/JS/CSS servido pelo Laravel | Não | Sim | Laravel/Apache/PHP-FPM | Não | Não | Sim |
| `scripts/build-public-assets.mjs` | Orquestrador de assets Laravel | Sim, para o processo de build | Não | Node durante o build | Não | Sim | Não |
| `dist/` | Saída intermediária Vite | Não | Sim | Não | Não | Não | Sim |

## Fluxo oficial

```text
src/main.js + src/styles.css + src/refinements.css
                         ↓ Vite
              public/assets/main.js + main.css

admin/index.html + admin/main.js + admin/*.css
                         ↓ sincronização determinística
              public/admin/*

resources/views/*.blade.php → Laravel em produção
src/ e admin/ → Vite → public/assets/ e public/admin/
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
passou a gerar os artefatos públicos. Blade continua sendo a fonte de templates
do Laravel.

## Guardas contra regressão

Use, nesta ordem, a partir de um checkout limpo:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm test:admin-contract
pnpm test:source
pnpm security:secrets
```

`pnpm test:source` compara byte a byte os arquivos do painel e compara o
manifesto Vite com `public/assets`. O workflow de CI executa esse guard após o
build. O resultado esperado é nenhuma diferença inesperada no `git diff` dos
artefatos gerados.

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
4. executar os testes Laravel relacionados;
5. revisar o diff, incluindo o artefato público gerado.

Não corrigir diretamente `public/assets` ou `public/admin` sem alterar a fonte
correspondente. O comportamento deve ser validado no runtime Laravel, que é a
única aplicação suportada.

## Limite do toolchain Node

O Node não é um runtime da aplicação. Ele existe apenas no ambiente de build
para executar Vite e os scripts de sincronização/secret scan. Nenhum serviço,
rota, autenticação ou persistência depende de Node.
