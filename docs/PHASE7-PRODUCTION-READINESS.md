# Fase 7 — Final Production Readiness

Data: 2026-10-05 (America/Sao_Paulo)

## Resumo executivo

A origem HTTP correta foi confirmada como `192.185.213.23`. Os registros A de
`@` e `www` já resolvem para esse IP em Cloudflare DNS, Google DNS e nos
nameservers autoritativos. `painel` ainda retorna NXDOMAIN.

A aplicação responde os health checks por HTTP e o diagnóstico HTTPS com
`-k`, mas a validação HTTPS normal falha porque o certificado da origem não
contém os hostnames públicos. O AutoSSL ainda é o blocker principal de
origem. O checkout HostGator também está em `a808885c...`, atrás do SHA
`5a286fca...` validado em local/origin; nenhum deploy foi executado.

O `app:production-check` remoto falha em R2 e OAuth. Não foram feitos testes
destrutivos em bucket, não foi iniciado login OAuth real e nenhum segredo foi
impresso.

## Evidências e findings

| ID | Severidade | Componente | Evidência | Risco | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P7-EXT-001 | HIGH | DNS | `@`/`www` apontam para `192.185.213.23`; `painel` retorna NXDOMAIN | Admin e emissão do certificado de `painel` não podem ser validados | Criar/confirmar A `painel -> 192.185.213.23` no Cloudflare | `nslookup`, DoH Cloudflare/Google e consulta autoritativa | BLOCKED_EXTERNALLY |
| P7-EXT-002 | HIGH | SSL/AutoSSL | HTTPS sem `-k` falha com `SEC_E_WRONG_PRINCIPAL`; SAN não contém domínios públicos | Não há cadeia confiável para produção nem base segura para Full strict | Emitir AutoSSL para os três hostnames | `curl` sem `-k` e inspeção SNI/SAN | BLOCKED_EXTERNALLY |
| P7-REL-001 | HIGH | Release HostGator | checkout remoto `a808885c...` difere de local/origin `5a286fca...` | Origem pública não contém a versão validada da aplicação | Deploy gated autorizado do SHA imutável | `git rev-parse` por SSH | NOT_EXECUTED_BY_POLICY |
| P7-INT-001 | HIGH | R2 | `app:production-check` remoto falha em R2; nenhum bucket de teste seguro foi autorizado | Upload/presign/delete reais não podem ser certificados | Configuração efetiva e bucket/prefixo de teste autorizado; depois smoke não destrutivo | production-check + testes R2 controlados | BLOCKED_BY_CONFIG/SECRET |
| P7-INT-002 | HIGH | OAuth | `app:production-check` remoto falha em OAuth | Login, callback e revogação não podem ser certificados | Configuração efetiva e redirect URI aprovada pelo provedor | fluxo OAuth real sem replay | BLOCKED_BY_CONFIG/SECRET |
| P7-EXT-003 | MEDIUM | Cloudflare | origem não passa HTTPS validado; `painel` sem DNS | Full strict/proxy e trusted proxy real não podem ser provados | Corrigir DNS/AutoSSL e só então configurar Full strict | requests proxied e spoof tests | BLOCKED_EXTERNALLY |
| P7-OPS-001 | MEDIUM | Deploy | `HOSTGATOR_DEPLOY_ENABLED=false` | Evita publicação acidental, mas mantém entrega manual pendente | Habilitar apenas após todos os gates e autorização explícita | revisão do workflow gated | NOT_ENABLED |

## DNS, SSL e canonical

DNS autoritativo: `alice.ns.cloudflare.com` e `damiete.ns.cloudflare.com`.

Estado observado:

- `gisleynunesimoveis.com.br` -> `192.185.213.23`;
- `www.gisleynunesimoveis.com.br` -> `192.185.213.23`;
- `painel.gisleynunesimoveis.com.br` -> NXDOMAIN.

HTTP não foi tratado como prova final de canonical HTTPS. Cloudflare está
DNS only no período de origem/AutoSSL e não foi alterado nesta rodada. Full
(strict), proxy e redirects finais permanecem bloqueados até o certificado
correto existir.

## PHP web e health

O endpoint HTTP respondeu Laravel e os dois endpoints retornaram exatamente
`{"status":"ok"}`. Isso confirma o caminho HTTP da aplicação, não confirma
PHP_VERSION/SAPI do web worker nem health público HTTPS confiável. Nenhum
`phpinfo()` foi criado ou exposto.

## R2 e OAuth

Os nomes das variáveis esperadas foram confirmados no `.env` remoto sem
imprimir valores. O runtime carregado, porém, ainda falha nos checks de R2 e
OAuth. Como o checkout remoto está stale e não existe autorização para usar
bucket produtivo destrutivamente, os fluxos upload/HEAD/GET/delete/orphan e
login/logout OAuth permanecem sem validação real.

## Cloudflare e trusted proxies

O código local possui CIDRs explícitos e ignora deliberadamente
`CF-Connecting-IP` quando o peer não pertence aos proxies confiáveis. Isso é
uma evidência estática, não uma prova de tráfego proxied. Testes de spoof de
`CF-Connecting-IP`, `X-Forwarded-For` e `X-Forwarded-Proto` ficam pendentes até
proxy e origem HTTPS estarem ativos.

## Deploy gated

O workflow `hostgator-deploy-gated` exige branch autorizada, SHA completo,
`HOSTGATOR_DEPLOY_ENABLED=true`, confirmação textual, known hosts estrito,
`BatchMode=yes`/identidades restritas no material de SSH, migrations opt-in e
health check com corpo exato `{"status":"ok"}`. A revisão estática foi feita;
o workflow continua inativo.

## Testes executados

- consultas A em 1.1.1.1, 8.8.8.8 e nos NS autoritativos;
- DNS-over-HTTPS em Cloudflare e Google;
- `curl` HTTP público e por `--resolve` para a origem correta;
- `curl` HTTPS sem `-k` para validação e com `-k` somente para diagnóstico;
- inspeção SNI/SAN do certificado por conexão TLS diagnóstica;
- SSH com `BatchMode=yes` e `IdentitiesOnly=yes`;
- `php artisan app:production-check` no HostGator;
- inspeção de saúde HTTP pública e de origem;
- revisão do workflow gated e do script de deploy.

## Status final

```text
DNS: WAITING
SSL ORIGIN: BLOCKED
HTTPS: FAIL
PHP WEB: FAIL / NOT VERIFIED
R2: BLOCKED
OAUTH: BLOCKED
TRUSTED PROXY REAL: BLOCKED
PRODUCTION CHECK: FAIL
HEALTH LIVE: BLOCKED (HTTP diagnóstico PASS; HTTPS validado pendente)
HEALTH READY: BLOCKED (HTTP diagnóstico PASS; HTTPS validado pendente)
CLOUDFLARE FULL STRICT: BLOCKED
FRONTEND REAL: BLOCKED
ADMIN REAL: BLOCKED
CWV: NOT VERIFIED
AUTOMATED DEPLOY: NOT ENABLED
PRODUCTION READINESS: FAIL
```

## Intervenções ainda necessárias

- Cloudflare DNS: `A painel -> 192.185.213.23`, DNS only durante AutoSSL.
- cPanel/HostGator: AutoSSL para `@`, `www` e `painel`.
- Ambiente seguro de R2 e configuração efetiva, sem enviar segredo pelo chat.
- Configuração OAuth aprovada pelo provedor, com callback
  `https://www.gisleynunesimoveis.com.br/api/auth/callback`.
- Janela de deploy explicitamente autorizada para publicar o SHA atual.
- Depois dos gates verdes: Cloudflare `Full (strict)`, proxy e smoke/CWV/admin
  reais.
