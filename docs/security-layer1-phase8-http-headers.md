# Camada 1 — Fase 8: Headers e política HTTP

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que o navegador receba políticas defensivas fortes sem depender de compatibilidade insegura ou quebrar o frontend.

## Política atual

### CSP
- `default-src 'self'`;
- scripts próprios com nonce;
- `script-src-attr 'none'`;
- sem `unsafe-inline`;
- sem `unsafe-eval`;
- `object-src 'none'`;
- `frame-src 'none'`;
- `worker-src 'none'`;
- `base-uri 'self'`;
- `form-action 'self'`;
- `frame-ancestors 'none'`;
- origins de mídia/connect explícitas;
- `upgrade-insecure-requests` em produção.

### Headers
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` bloqueando câmera, microfone, geolocalização e pagamento;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Resource-Policy: same-origin`;
- `X-Frame-Options: DENY`;
- `Origin-Agent-Cluster: ?1`;
- `X-Permitted-Cross-Domain-Policies: none`;
- HSTS em produção.

## Cache

- auth: `no-store`;
- admin API: `no-store`;
- admin HTML: `no-cache, no-store, must-revalidate`;
- assets hashed: cache longo e immutable;
- imagens de nome fixo: cache curto + stale-while-revalidate;
- API pública: cache limitado.

## Achados

### F8-01 — Frontend usava style inline incompatível com CSP
**Severidade:** Média funcional / Baixa de segurança  
**Status:** Corrigido

Cards do catálogo usavam:
`style="--card-index:..."`

Como a CSP não libera estilo inline, isso poderia ser bloqueado em produção.

**Correção:** atraso de animação passou a usar classes CSS `listing-delay-N`; CSP continua restrita.

### F8-02 — Headers complementares
**Severidade:** Preventiva  
**Status:** Implementado

Adicionados:
- `Origin-Agent-Cluster: ?1`;
- `X-Permitted-Cross-Domain-Policies: none`.

### F8-03 — unsafe-inline / unsafe-eval
**Resultado:** Não presentes

Gate automático impede regressão.

### F8-04 — HSTS
**Resultado:** Ativo em produção

`max-age=31536000; includeSubDomains`.

Não foi adicionado `preload` nesta etapa porque isso deve ser uma decisão de infraestrutura somente depois de confirmar HTTPS permanente em todos os subdomínios.

## Gate da Fase 8

PASS somente se:
- CSP não usar unsafe-inline/unsafe-eval para script;
- frontend não depender de estilo inline bloqueado;
- framing permanecer negado;
- object/embed permanecer negado;
- nosniff/referrer/permissions/COOP/CORP permanecerem;
- HSTS existir em produção;
- auth/admin permanecerem no-store;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 9 — Rate limiting e abuso**

Foco:
- login;
- contato;
- admin;
- upload;
- ações destrutivas;
- proxy compartilhado;
- CF-Connecting-IP;
- crescimento de memória do limiter;
- burst e Retry-After.
