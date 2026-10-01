# Camada 1 — Fase 4: Origem, CSRF e isolamento do painel

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que uma sessão administrativa válida não possa ser usada por outra origem, host, subdomínio ou contexto de navegação para executar mutações no CRM.

## Controles confirmados

- `PUBLIC_ORIGIN` e `ADMIN_ORIGIN` são obrigatórios em produção;
- ambos precisam usar HTTPS;
- os hosts público e administrativo precisam ser diferentes;
- Host desconhecido recebe `421 MISDIRECTED_REQUEST`;
- `/api/auth/*` e `/api/admin/*` são restritos ao host do painel;
- apenas `/api/auth/login` pode redirecionar do domínio público para o painel;
- callback OAuth no domínio público recebe 404;
- mutações públicas esperam a origem pública;
- mutações administrativas esperam a origem administrativa;
- domínio irmão `www` não é aceito como origem do `painel`;
- `same-site` não é tratado como `same-origin`;
- `Origin: null` é rejeitado;
- ausência de `Origin` em produção com origem canônica é rejeitada;
- `Sec-Fetch-Site: cross-site` ou `same-site` contraditório bloqueia a requisição.

## Achados e correções

### F4-01 — Origem canônica dependia de X-Forwarded-Proto
**Severidade:** Média-baixa  
**Status:** Corrigido

Quando `TRUST_PROXY_MODE=cloudflare`, `requestHostOrigin()` usava `X-Forwarded-Proto` para determinar HTTP/HTTPS.

Em produção os hosts canônicos já são conhecidos. Confiar no header para esses hosts aumentava desnecessariamente a superfície de spoof em caso de acesso direto ao origin.

**Correção:** para hosts configurados, a origem é derivada diretamente de `PUBLIC_ORIGIN` ou `ADMIN_ORIGIN`. Headers encaminhados são apenas fallback fora dos hosts canônicos.

### F4-02 — Host poisoning
**Severidade:** Alta se existente  
**Resultado:** Bloqueado

`requireKnownHost` aceita somente os hosts configurados em produção. Sufixos como `www.gisley.test.evil.example` não passam.

### F4-03 — CSRF entre subdomínios irmãos
**Severidade:** Alta se existente  
**Resultado:** Bloqueado

O domínio público não pode realizar mutações administrativas e o painel não pode postar no endpoint público de contato usando apenas relação `same-site`.

### F4-04 — Origin ausente/null
**Severidade:** Média se aceita  
**Resultado:** Bloqueado em produção canônica

`Origin: null` e ausência de Origin não passam nas mutações quando a origem canônica está configurada.

### F4-05 — Callback/login fora do painel
**Severidade:** Média  
**Resultado:** Controlado

- login GET iniciado no domínio público redireciona exclusivamente ao `ADMIN_ORIGIN`;
- callback não é processado fora do host administrativo;
- demais APIs auth/admin no host público retornam 404.

## Confiança em proxy

- `TRUST_PROXY_MODE` aceita apenas vazio ou `cloudflare`;
- `CF-Connecting-IP` permanece ignorado salvo opt-in separado;
- confiar em IP do cliente sem modo Cloudflare faz startup falhar;
- hosts canônicos não dependem mais de `X-Forwarded-Proto`.

## Testes adicionados/ampliados

- Host canônico vs desconhecido;
- separação obrigatória entre host público e painel;
- Origin público vs administrativo;
- `Origin: null`;
- ausência de Origin;
- `same-site` vs `same-origin`;
- metadata contraditória;
- callback OAuth no domínio incorreto;
- spoof de `X-Forwarded-Proto`;
- configuração insegura de proxy/IP.

## Gate da Fase 4

- Host poisoning: bloqueado;
- CSRF cross-site: bloqueado;
- same-site sibling: bloqueado;
- callback em host incorreto: bloqueado;
- origens HTTPS separadas: obrigatório;
- CI: PASS;
- CodeQL: aguardando confirmação final desta revisão no momento da escrita.

## Próxima fase

**Fase 5 — Validação de entrada**

Revisar `body`, `params` e `query`, limites de tamanho, tipos, enums, campos extras, Unicode, números extremos e payloads inesperados.
