# Design system — Gisley Nunes Imóveis

Este documento registra as decisões visuais usadas pelo site público e serve como referência para novas telas. A fonte de estilos continua sendo `src/styles.css`, `src/refinements.css` e, no painel, `admin/styles.css` e `admin/refinements.css`.

## Direção

O produto usa uma linguagem editorial de imobiliária local: verde profundo para confiança, cobre para ação e creme/areia para dar respiro às imagens. A composição combina Fraunces em títulos e Manrope em interface e texto corrido. O objetivo é transmitir curadoria e atendimento próximo, sem transformar cada seção em um card ou em uma animação.

## Tokens principais

| Grupo | Valores de referência |
| --- | --- |
| Cores | `--ink #123c46`, `--deep #0a2930`, `--copper #8f523b`, `--cream #f6f4ef`, `--sand #e7ded2`, `--muted #607477` |
| Tipografia | Fraunces 500/600/700 para títulos; Manrope 400/500/600/700/800 para interface |
| Raio | `--radius-xs 8px`, `--radius-sm 12px`, `--radius-md 20px`, `--radius-lg 32px`, `--radius-xl 44px` |
| Largura | `.shell` como contêiner principal; texto longo limitado a medidas confortáveis |
| Foco | outline cobre de 3px com offset de 2px |
| Movimento | transições curtas para estado; revelações discretas; todos os efeitos não essenciais respeitam `prefers-reduced-motion` |

## Componentes

- Botões primários usam fundo `--ink` ou `--deep`, texto claro e uma seta simples como affordance.
- Botões de contorno ficam reservados para ações secundárias e filtros.
- Campos sempre têm label visível, foco destacado e mensagem de status quando a ação é assíncrona.
- Cards de imóvel mantêm uma área de imagem previsível, título, localização, preço e metadados essenciais. Tags são informativas, não decorativas.
- Empty, loading e error states devem explicar o próximo passo em linguagem humana.
- O painel administrativo prioriza densidade informacional, navegação previsível e confirmação explícita para ações destrutivas.

## Responsividade

O layout é validado em 320, 360, 375, 390, 414, 768, 1024, 1280, 1440 e 1920px. No celular, a navegação vira menu, os filtros empilham e a página de imóvel oferece CTA de interesse persistente no fluxo, respeitando a safe area inferior.

## Imagens

Imagens de conteúdo secundário usam lazy loading e decoding assíncrono. Imagens de catálogo reservam dimensões e informam `sizes` para reduzir mudança de layout. A primeira imagem da galeria do imóvel é prioritária; miniaturas continuam sob demanda.

## Acessibilidade

O sistema preserva landmarks semânticos, labels visíveis, foco consistente, alvos de toque confortáveis, estados `aria-live` para feedback e navegação por teclado na galeria e nos diálogos. Nunca remover `outline` sem fornecer um equivalente visível.

## Regra de manutenção

Altere primeiro a fonte (`src/`, `admin/`, `resources/views/` ou `views/`) e depois execute `pnpm build` e `pnpm test:source`. Não edite `public/assets/` ou `public/admin/` manualmente.
