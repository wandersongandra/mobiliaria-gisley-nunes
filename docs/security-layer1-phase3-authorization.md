# Camada 1 — Fase 3: Autorização e privilégio mínimo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que toda ação administrativa dependa de capacidade explícita, que Editor não consiga escalar privilégios por chamada direta e que regras críticas sejam revalidadas na persistência.

## Modelo de capacidades

### Editor
- `property.read`
- `property.write`
- `media.manage`
- `site.read`
- `lead.read`
- `lead.status`

### Gestor
Inclui todas as capacidades do Editor e:
- `property.publish`
- `property.archive`
- `site.manage`
- `testimonial.manage`
- `lead.erase`
- `audit.read`
- `team.manage`

Papéis desconhecidos falham fechados e não recebem capacidades.

## Achados e correções

### F3-01 — Identificadores OAuth parcialmente expostos no CRM
**Severidade:** Baixa  
**Status:** Corrigido

`staffView` e `auditView` ainda entregavam fragmentos estáveis do OpenID.

**Correção:** OpenID permanece somente no backend/banco. API e UI não recebem nem hints.

### F3-02 — Regra draft-only existia apenas na rota
**Severidade:** Média  
**Status:** Corrigido

A rota impedia Editor de publicar/destacar, porém a função de persistência aceitava estado final publicado caso o guard superior fosse removido por regressão futura.

**Correção:** `saveProperty(..., { requireDraft: true })` agora exige:
- recurso atual em draft;
- estado final em draft;
- `featured=false`.

A mesma regra é usada em criação e atualização.

### F3-03 — Nova rota administrativa poderia esquecer capability específica
**Severidade:** Média  
**Status:** Corrigido

A autenticação global protegeria a rota, mas Editor e Gestor poderiam receber o mesmo acesso por engano.

**Correção:** novo teste estrutural mantém matriz explícita rota → capability e falha o CI se:
- nova rota surgir sem classificação;
- capability esperada mudar;
- rota desaparecer sem atualizar a matriz.

### F3-04 — Regras de proteção de equipe estavam espalhadas na rota
**Severidade:** Média-baixa  
**Status:** Corrigido

Auto-rebaixamento, auto-remoção e proteção do gestor bootstrap estavam corretos, porém acoplados à implementação da rota.

**Correção:** regras centralizadas em:
- `staffMutationError`;
- `staffRemovalError`.

Cobertura direta garante:
- gestor não se rebaixa;
- gestor não se desativa;
- gestor não remove a própria identidade;
- bootstrap não é rebaixado/desativado/removido;
- ator não-manager falha fechado.

## IDOR e recursos

O produto atual é single-tenant: toda a equipe pertence à mesma imobiliária. Portanto, não existe fronteira de tenant a inventar.

As fronteiras relevantes foram verificadas:

- foto é resolvida pelo ID e depois vinculada ao imóvel real antes da autorização;
- storage path precisa pertencer ao imóvel esperado;
- reordenação aceita exatamente o conjunto de fotos daquele imóvel;
- Editor não consegue operar mídia de imóvel publicado/arquivado;
- checks de status são repetidos dentro da transação com lock;
- payload adulterado não permite publicação/destaque.

## Gate da Fase 3

**PASS**

- capability matrix: PASS
- Editor → Manager escalation: PASS
- draft-only persistence: PASS
- resource-state TOCTOU: PASS
- staff self-protection: PASS
- bootstrap protection: PASS
- OAuth identifier minimization: PASS
- CI: PASS
- CodeQL: PASS

## Próxima fase

**Fase 4 — Origem, CSRF e domínio administrativo**

Foco:
- Host e Origin;
- `ADMIN_ORIGIN`;
- requisições cross-site;
- `Sec-Fetch-Site`;
- spoofing de `X-Forwarded-*`;
- separação real `www` × `painel`;
- callbacks e redirects.
