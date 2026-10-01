# Camada 1 — Fase 4: Origem, CSRF e domínio administrativo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir separação efetiva entre site público e painel, impedir mutações cross-site e rejeitar Host/origens ambiguamente configurados.

## Controles validados

- `PUBLIC_ORIGIN` e `ADMIN_ORIGIN` distintos em produção;
- ambos obrigatoriamente HTTPS;
- Host allowlist em produção;
- `/api/admin/*` e `/api/auth/*` restritos ao host administrativo;
- mutações públicas exigem Origin pública;
- mutações administrativas exigem Origin do painel;
- `Origin: null` rejeitada;
- `Sec-Fetch-Site: same-site` não é tratado como same-origin;
- conflito Origin × Fetch Metadata é rejeitado;
- callback OAuth no domínio público retorna 404;
- login iniciado no domínio público redireciona para o painel;
- `X-Forwarded-Proto` só é considerado em modo Cloudflare;
- `CF-Connecting-IP` não é confiado por padrão;
- health/readiness só ignoram Host em conexão loopback real.

## Achado

### F4-01 — Origem canônica aceitava configuração ambígua
**Severidade:** Média-baixa  
**Status:** Corrigido

Configurações como:

- `https://dominio/admin`
- `https://dominio/?x=1`
- `https://user:pass@dominio/`

eram normalizadas silenciosamente para a origem.

**Correção:** configuração agora falha fechada. Só é aceito:

`scheme://host[:port]`

com barra final opcional.

## Testes adversariais

Cobertos:

- domínio parecido (`site.com.evil.example`);
- porta não autorizada;
- Host desconhecido;
- callback OAuth no host errado;
- mutação sem Origin;
- Origin pública tentando API admin;
- Origin admin tentando mutação pública;
- `Origin: null`;
- Fetch Metadata contraditório;
- spoof de protocolo encaminhado;
- headers de IP Cloudflare sem trust explícito;
- exceção de health apenas em loopback.

## Gate da Fase 4

**PASS**

- Host allowlist: PASS
- ADMIN_ORIGIN isolation: PASS
- public/admin origin separation: PASS
- CSRF same-origin: PASS
- null Origin rejection: PASS
- Fetch Metadata consistency: PASS
- callback host restriction: PASS
- proxy trust defaults: PASS
- CI: PASS
- CodeQL: PASS

## Próxima fase

**Fase 5 — Validação de entrada**

Foco:
- body, params e query;
- tipos inesperados;
- campos extras;
- IDs;
- números;
- Unicode/control chars;
- URLs;
- payload máximo;
- fail-closed validation.
