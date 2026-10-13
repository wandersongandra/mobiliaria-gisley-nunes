# Auditoria e correções mobile — 13/10/2026

## Escopo
Front-end público (celular/tablet) e editor do CRM em telas estreitas. Cadastro de imóveis, fotos e conteúdo de anúncios **fora de escopo**: o proprietário está substituindo o material provisório. Nenhuma API, política de autenticação, tabela de banco ou integração foi alterada.

## Achados reproduzidos no código e correções
| ID | Prioridade | Problema observado no código | Correção |
| --- | --- | --- | --- |
| MOB-01 | Alta | CSS mantém navegação móvel até 980px, mas JS fechava o menu ao atingir 901px. | Breakpoint do JS alinhado para 981px; altura e scroll internos do menu limitados ao viewport. |
| MOB-02 | Alta | `initListing()` limpava o catálogo inicial SSR antes da primeira resposta da API; falha temporária apagava resultados válidos. | Preservar cards SSR durante primeira busca e mostrar aviso explícito caso haja falha. |
| MOB-03 | Alta | `initPropertyDetail()` reescrevia o HTML Blade já renderizado em toda navegação. | Usar o DOM SSR existente e apenas vincular eventos; continuar montando o HTML nos previews sem SSR. |
| MOB-04 | Alta | `.sidebar-bottom` ficava com `display:none` no mobile, ocultando encerramento de sessão e revogação de sessões. | Exibir ações de sessão e status de erro no rodapé da barra superior móvel. |
| MOB-05 | Média | Entradas do editor/CRM usam fontes de 12px; inputs abaixo de 16px podem acionar zoom ao receber foco no iOS. | Controles do editor, filtros e formulários do painel com 16px e altura mínima de 44px no celular. |
| MOB-06 | Média | Botão de menu (36–38px), setas da galeria e alguns alvos de navegação menores que 44px. | Áreas de toque mínimas de 44px; paginação, CTA e menu redimensionados. |
| MOB-07 | Média | Barra de interesse do imóvel e WhatsApp flutuante compartilham a região inferior da tela. | Reservar separação vertical no mobile, respeitando safe-area. |
| MOB-08 | Média | Edição de fotos exige precisão excessiva em botões de 20px e usa grid compacto. | Controles de foto de 44px e grade adaptativa; corrigido estado vazio da grade. |
| MOB-09 | Baixa | Rolagem programática dos filtros/miniaturas ignora preferência por movimento reduzido. | Trocar para rolagem instantânea quando `prefers-reduced-motion: reduce`. |

## Alterações
- `src/main.js`: hidratação SSR, breakpoint de menu, galeria e movimento.
- `src/refinements.css`: legibilidade mobile, alvos de toque e espaçamento seguro.
- `admin/refinements.css`: controles de sessão e editor de imóveis no celular.
- `tests/browser/frontend.smoke.spec.js`: testes de menu em 900/950/990px, campos com 16px, botão de 44px e atalho do imóvel.

## Verificações concluídas
- Verificação de sintaxe JavaScript no motor V8: `PARSE PASS` para `src/main.js` e os testes Playwright alterados.
- Balanceamento de chaves CSS: `PASS` nos dois estilos modificados.
- Revisão das condições de media queries e dos seletores alterados.

## Pendente antes de aprovar merge ou deploy
1. **Concluído no GitHub Actions**: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test:source`, `pnpm build:preview`, `pnpm test:browser` (10/10), `pnpm test` (185 aprovados, 1 pulado), no commit anterior à sincronização dos artefatos. Revalidar checks do SHA final antes do merge.
2. CI da PR para a versão anterior à sincronização de artefatos retornou sucesso em frontend, Laravel CI, CodeQL e pacote de produção. Conferir a versão final após o último commit.
3. Artefatos de produção **sincronizados e versionados** em 13/10/2026, por workflow temporário de build que executou `pnpm build` e `pnpm test:source` com resultado positivo: `public/assets/main.js`, `public/assets/main.css` e `public/admin/refinements.css`. Workflow temporário removido após uso; não editar artefatos manualmente.
4. QA visual/interativo em 320, 360, 375, 390, 414, 768, 950 e 1024px. Testar teclado iOS/Android, bloqueio e abertura do menu, formulário, galeria e modo com movimento reduzido.
5. Testar autenticação real do CRM, salvamento/upload de foto, navegação da sidebar e revogação de sessão em celular autorizado, sem usar dados reais de clientes em teste.
6. Validar Core Web Vitals (LCP/CLS/INP) em origem publicada; não estimar ganhos sem medições.

## Política de publicação
Branch de trabalho isolada; PR em rascunho; sem merge ou deploy. Manter cadastro e fotos reais sob responsabilidade do proprietário.