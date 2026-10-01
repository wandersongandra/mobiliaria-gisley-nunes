# Camada 1 — Fase 4: Origem, CSRF e isolamento do domínio administrativo

Data: 2026-10-01
Branch: `audit/security-design-2026-09-30`

## Escopo

Revisar Host, Origin, Fetch Metadata, X-Forwarded-*, separação entre domínio público e painel, callback OAuth no host correto, CSRF em mutações e comportamento de requisições administrativas seguras (GET).

## Arquitetura validada

- `PUBLIC_ORIGIN` e `ADMIN_ORIGIN` são obrigatoriamente separados em produção.
- Ambos precisam ser HTTPS em produção.
- Host desconhecido retorna `421 MISDIRECTED_REQUEST`.
- `/api/auth/*` e `/api/admin/*` ficam vinculados ao host administrativo.
- Login iniciado no domínio público é redirecionado para o painel.
- Callback OAuth no domínio público não é processado.
- Mutações exigem Origin exatamente igual à origem canônica esperada.
- `Origin: null` é rejeitada.
- `Sec-Fetch-Site: same-site` e `cross-site` são rejeitados em mutações.
- `X-Forwarded-Proto` só é considerado quando `TRUST_PROXY_MODE=cloudflare`.
- `CF-Connecting-IP` é ignorado por padrão; só é aceito com confiança explícita separada.

## Achados

### F4-01 — GET administrativo podia ser disparado por subdomínio same-site
Severidade: Média-baixa
Status: Corrigido

`requireSameOrigin` corretamente ignora métodos seguros, mas isso permitia que um subdomínio irmão comprometido disparasse GETs contra o painel. A política de mesma origem do navegador impediria a leitura da resposta, porém a requisição ainda poderia tocar sessão e gerar carga.

Correção:
- novo `requireAdminRequestContext`;
- aplicado a todo `/api/admin/*`, inclusive `/api/admin/session`;
- rejeita `Sec-Fetch-Site: same-site` e `cross-site`;
- aceita `same-origin`, `none` e header ausente para compatibilidade;
- exige host administrativo quando `ADMIN_ORIGIN` está configurado.

### F4-02 — Host com lista separada por vírgula era normalizado para o primeiro valor
Severidade: Média
Status: Corrigido

O parser de Host reutilizava um helper apropriado para headers encaminhados e aceitava:

`Host: painel.gisley.test,evil.example`

como se fosse apenas `painel.gisley.test`.

Correção:
- `safeHost()` agora rejeita qualquer Host contendo vírgula;
- listas, espaços, sufixos maliciosos, trailing dot e malformed host são testados.

### F4-03 — Porta padrão explícita era tratada como host diferente
Severidade: Baixa
Status: Corrigido

`painel.gisley.test:443` poderia falhar apesar de ser equivalente à origem HTTPS configurada.

Correção:
- porta 443 explícita é aceita para origem HTTPS sem porta explícita;
- porta 80 equivalente para HTTP;
- portas divergentes continuam rejeitadas;
- origem configurada com porta não padrão exige exatamente essa porta.

## Proteções confirmadas

- domínio público não consegue mutar API administrativa;
- painel não consegue usar sua origem para mutar endpoint público;
- callback OAuth só funciona no painel;
- Host público não vira admin por `X-Forwarded-Proto`;
- Host com sufixo malicioso é rejeitado;
- Origin null é rejeitada;
- same-site não é tratado como same-origin;
- GET administrativo também possui Fetch Metadata guard;
- saúde local continua possível por loopback sem abrir Host genérico.

## Gate

PASS quando:
- CI verde;
- CodeQL verde;
- Host poisoning tests PASS;
- canonical origin separation PASS;
- CSRF mutation tests PASS;
- admin GET context PASS;
- OAuth callback wrong-host FAIL;
- forwarded-header spoof tests PASS;
- default/non-default port tests PASS.

## Próxima fase

Fase 5 — Validação de entrada:
- body/query/params;
- contratos fechados;
- payload oversized;
- chaves extras;
- NaN/Infinity/negativos;
- Unicode/control characters;
- arrays/objects em campos escalares;
- IDs/slugs;
- strings gigantes;
- content-type inesperado.
