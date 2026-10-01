# Camada 1 — Fase 4: Origem, CSRF e domínio administrativo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir separação estrita entre site público, painel administrativo e origens externas, evitando:
- CSRF;
- Host header abuse;
- callback OAuth no host errado;
- spoofing de proxy;
- CORS permissivo;
- uso indevido de `X-Forwarded-*`.

## Controles verificados

### Host
Em produção, apenas os hosts canônicos definidos por:
- `PUBLIC_ORIGIN`;
- `ADMIN_ORIGIN`;

são aceitos.

Hosts desconhecidos recebem:
`421 MISDIRECTED_REQUEST`.

A única exceção é liveness/readiness em loopback local.

### Separação público × painel
- domínio público serve site;
- domínio do painel serve admin/auth;
- callback OAuth no domínio público é bloqueado;
- login iniciado no domínio público redireciona apenas para o painel configurado;
- painel não serve acidentalmente a home pública.

### CSRF / mesma origem
Mutações exigem `Origin` exatamente igual à origem esperada.

Quando origins canônicas estão configuradas:
- ausência de `Origin` em mutação falha fechada;
- `same-site` não é tratado como `same-origin`;
- `Origin: null` é rejeitado;
- `Sec-Fetch-Site: cross-site` contraditório é rejeitado.

### Admin GET
Mesmo requests GET administrativos passam por `requireAdminRequestContext`.

`Sec-Fetch-Site` igual a `same-site` ou `cross-site` é rejeitado.

### Proxy
`X-Forwarded-Proto` só é considerado quando:
`TRUST_PROXY_MODE=cloudflare`.

`CF-Connecting-IP` exige adicionalmente:
`TRUST_CLIENT_IP_HEADER=true`.

Sem isso, o endereço usado é o socket real.

### CORS
Não existe middleware CORS global, nem:
- `Access-Control-Allow-Origin: *`;
- `Access-Control-Allow-Credentials`.

Preflight cross-origin administrativo não recebe headers de liberação.

## Achados

### F4-01 — Host allowlist
**Resultado:** PASS

Hosts maliciosos, sufixos falsos, listas e portas divergentes são rejeitados.

### F4-02 — CSRF same-site
**Resultado:** PASS

Subdomínio público não consegue usar a sessão do painel para mutação administrativa.

### F4-03 — Callback OAuth no host errado
**Resultado:** PASS

Callback no domínio público recebe 404 e não é processado.

### F4-04 — X-Forwarded-Proto spoofing
**Resultado:** PASS

Hosts canônicos usam a origem configurada e não confiam em protocolo encaminhado contraditório.

### F4-05 — CF-Connecting-IP
**Resultado:** PASS com condição operacional

Header só é confiado com opt-in duplo. Antes de habilitar em produção, o origin precisa estar bloqueado contra acesso direto.

### F4-06 — CORS permissivo
**Resultado:** Não encontrado

Foi adicionado gate automático para impedir regressão.

## Gate da Fase 4

PASS somente se:
- Host desconhecido em produção resultar em 421;
- público e painel permanecerem separados;
- callback OAuth no host errado não for processado;
- mutações cross-origin falharem;
- Origin ausente/null falhar com origins canônicas;
- same-site não equivaler a same-origin;
- proxy headers só forem confiados por configuração explícita;
- CORS administrativo não for aberto;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 5 — Validação de entrada**

Foco:
- contratos fechados;
- chaves extras;
- payloads gigantes;
- tipos estruturais;
- números estranhos;
- Unicode de controle;
- IDs/slugs;
- query strings;
- limites de texto;
- JSON inválido;
- content-type incorreto.
