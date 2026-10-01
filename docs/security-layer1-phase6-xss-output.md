# Camada 1 — Fase 6: XSS e saída para navegador

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que conteúdo armazenado no CRM ou recebido por API nunca se transforme em HTML/JavaScript executável no site público ou no painel.

## Superfícies revisadas

- EJS com `<%= ... %>`;
- saídas deliberadamente raw com `<%- ... %>`;
- JSON embutido em `<script type="application/json">`;
- JSON-LD;
- `innerHTML` no site;
- `innerHTML` no CRM;
- atributos `href`, `src`, `data-*`;
- URLs de mídia;
- CSP.

## EJS

Valores normais usam `<%= ... %>`, que aplica escaping HTML.

Os poucos `<%- ... %>` são usados somente para JSON já neutralizado por:
`escapeJsonForHtml()` / `escapeLd()`.

A função neutraliza:
- `<`;
- `>`;
- `&`;
- U+2028;
- U+2029.

Isso impede fechamento de `</script>` por conteúdo armazenado.

## DOM dinâmico

`src/main.js` e `admin/main.js` usam `innerHTML` em componentes controlados.

Dados vindos de API/CRM passam por `escapeHTML()` antes de entrar em:
- texto;
- atributos;
- data attributes;
- links de e-mail;
- mensagens de lead;
- equipe;
- auditoria;
- depoimentos;
- catálogo.

IDs sensíveis também passam por contratos server-side.

## URLs

Foi adicionada uma barreira no presenter para mídia.

São aceitos:
- HTTPS;
- `/media/*`;
- rota legado interna quando explicitamente utilizada.

São rejeitados:
- `javascript:`;
- `data:`;
- HTTP inseguro;
- esquemas desconhecidos.

## CSP

A política atual bloqueia:
- `unsafe-inline`;
- `unsafe-eval`;
- script attributes;
- object/embed;
- frames;
- workers;
- framing externo.

Scripts próprios usam nonce por request.

## Achados

### F6-01 — Stored XSS em campos do CRM
**Resultado:** Não reproduzido

Campos exibidos via HTML dinâmico são escapados e os templates EJS usam escaping padrão.

### F6-02 — Breakout de script por JSON embutido
**Resultado:** Bloqueado

Foi adicionado teste com payload contendo:
`</script><script>...`

O JSON serializado não mantém caracteres capazes de encerrar a tag.

### F6-03 — Esquema inseguro em URL de mídia
**Severidade:** Preventiva  
**Status:** Corrigido

Presenters agora rejeitam `javascript:`, `data:`, HTTP e esquemas não esperados.

### F6-04 — Regressão CSP
**Severidade:** Preventiva  
**Status:** Gate adicionado

Teste garante ausência de `unsafe-inline` e `unsafe-eval`, além de exigir `script-src-attr 'none'`.

## Gate da Fase 6

PASS somente se:
- JSON embutido não permitir `</script>`;
- dados de CRM passarem por escaping antes de `innerHTML`;
- URLs de mídia inseguras forem removidas;
- CSP bloquear inline/eval/atributos;
- EJS raw permanecer restrito a conteúdo previamente neutralizado;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 7 — Upload e mídia adversarial**

Foco:
- MIME falso;
- extensão dupla;
- executável renomeado;
- SVG;
- arquivo vazio/grande;
- magic bytes;
- path traversal;
- reutilização de URL assinada;
- upload para outro imóvel;
- cleanup de órfãos;
- limites de galeria.
