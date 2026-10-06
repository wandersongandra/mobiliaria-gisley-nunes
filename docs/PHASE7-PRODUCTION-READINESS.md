# Fase 7 — Final Production Readiness

Data: 2026-10-05 (America/Sao_Paulo)

## Resumo executivo

Uma sonda somente leitura de 2026-10-05 confirmou os três registros A em
`192.185.213.23`. `curl` sem `-k` retornou `HTTP 200`, `ssl=0` e
`{"status":"ok"}` em `/health/live` e `/health/ready` no domínio público e em
`/health/live` no painel. O checkout público ainda não foi comparado nesta
continuação com o SHA local `f104609`; portanto essa prova não é aprovação de
deploy da versão atual.

O `app:production-check` remoto falha em R2 e OAuth. Não foram feitos testes
destrutivos em bucket, não foi iniciado login OAuth real e nenhum segredo foi
impresso.

A troca `manus -> google` também requer re-vinculação controlada das identidades
administrativas existentes. O código não une providers distintos apenas por
e-mail; essa operação deve ocorrer por convite/bootstrap explícito.

## Evidências e findings

| ID | Severidade | Componente | Evidência | Risco | Correção | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P7-EXT-001 | HIGH | DNS | `@`, `www` e `painel` resolveram para `192.185.213.23` na sonda atual | Drift futuro ou resolver divergente ainda pode afetar a publicação | Manter registros e revalidar antes do deploy | `Resolve-DnsName` + `curl` | RESOLVED_CURRENT_PROBE |
| P7-EXT-002 | HIGH | SSL/AutoSSL | Os três checks HTTPS passaram sem `-k`, com `ssl=0` | SHA/runtime e Full strict ainda não foram provados | Comparar checkout público e validar Cloudflare Full strict | `curl` sem `-k` | RESOLVED_CURRENT_PROBE |
| P7-REL-001 | HIGH | Release HostGator | Último SSH documentado registrava checkout remoto stale; a sonda atual não comparou SHA público | Origem pública pode não conter a versão validada da aplicação | Deploy gated autorizado do SHA imutável e comparação por SSH | `git rev-parse` por SSH | NOT_EXECUTED_BY_POLICY |
| P7-INT-001 | HIGH | R2 | Último `app:production-check` remoto documentado falhou em R2; nenhuma prova live nova foi executada | Upload/presign/delete reais não podem ser certificados | Configuração efetiva e bucket/prefixo de teste autorizado; depois smoke não destrutivo | production-check + testes R2 controlados | BLOCKED_BY_CONFIG/SECRET |
| P7-INT-002 | HIGH | Google OAuth | Último `app:production-check` remoto documentado falhou em OAuth; nenhuma prova E2E nova foi executada | Login, callback e revogação não podem ser certificados | Publicar o código Google, configurar credenciais no ambiente e aprovar o redirect URI | fluxo OAuth real sem replay | BLOCKED_BY_CONFIG/SECRET |
| P7-EXT-003 | MEDIUM | Cloudflare | HTTPS/DNS passaram na sonda atual, mas proxy e tráfego proxied não foram exercitados | Full strict/proxy e trusted proxy real não podem ser provados | Configurar Full strict e validar requests proxied/spoof após autorização | requests proxied e spoof tests | NOT_VERIFIED_EXTERNAL |
| P7-OPS-001 | MEDIUM | Deploy | `HOSTGATOR_DEPLOY_ENABLED=false` | Evita publicação acidental, mas mantém entrega manual pendente | Habilitar apenas após todos os gates e autorização explícita | revisão do workflow gated | NOT_ENABLED |

## DNS, SSL e canonical

DNS autoritativo: `alice.ns.cloudflare.com` e `damiete.ns.cloudflare.com`.

Estado observado:

- `gisleynunesimoveis.com.br` -> `192.185.213.23`;
- `www.gisleynunesimoveis.com.br` -> `192.185.213.23`;
- `painel.gisleynunesimoveis.com.br` -> `192.185.213.23`.

Os checks HTTPS atuais passaram sem `-k`. Cloudflare Full (strict), proxy,
redirects finais e o SHA público permanecem não verificados nesta rodada.

## PHP web e health

Os endpoints públicos testados retornaram exatamente `{"status":"ok"}` por
HTTPS validado (`ssl=0`). Isso confirma o caminho observado da aplicação, não
confirma PHP_VERSION/SAPI nem que o runtime público corresponde ao SHA local.
Nenhum `phpinfo()` foi criado ou exposto.

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
DNS: PASS (sonda atual)
SSL ORIGIN: PASS (hostnames testados)
HTTPS: PASS (endpoints testados)
PHP WEB: HEALTH PASS / SAPI NOT VERIFIED
R2: BLOCKED
OAUTH: BLOCKED
TRUSTED PROXY REAL: BLOCKED
PRODUCTION CHECK: FAIL
HEALTH LIVE: PASS (endpoints testados)
HEALTH READY: PASS (endpoint público testado)
CLOUDFLARE FULL STRICT: BLOCKED
FRONTEND REAL: BLOCKED
ADMIN REAL: BLOCKED
CWV: NOT VERIFIED
AUTOMATED DEPLOY: NOT ENABLED
PRODUCTION READINESS: FAIL
```

## Intervenções ainda necessárias

- Ambiente seguro de R2 e configuração efetiva, sem enviar segredo pelo chat.
- Cliente OAuth Web do Google Cloud configurado com o callback exato
  `https://painel.gisleynunesimoveis.com.br/api/auth/callback`, seguido de
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
  `GISELY_ADMIN_BOOTSTRAP_EMAILS` no ambiente remoto.
- Janela de deploy explicitamente autorizada para publicar o SHA atual.
- Depois dos gates verdes: Cloudflare `Full (strict)`, proxy e smoke/CWV/admin
  reais.
