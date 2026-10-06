# Estado operacional atual — Gisley Nunes Imóveis

Data da verificação: 2026-10-06 (America/Sao_Paulo)

Atualização desta continuação: o HEAD local e a origem da branch autorizada
estão em `b147c616580ee497cafbe96bbc67dc741d6d8e28`. A remediação de
segurança local foi validada nesta rodada; isso não confirma que o runtime
público executa este SHA.

Uma sonda somente leitura executada em 2026-10-05 confirmou DNS A para
`@`, `www` e `painel` em `192.185.213.23`.
`curl` sem `-k` retornou `HTTP 200`, `ssl=0` e o corpo exato
`{"status":"ok"}` em `/health/live` e `/health/ready` no domínio público, e
em `/health/live` no painel. Essa prova confirma o endpoint público observado,
mas não confirma que ele já executa o SHA local atual, nem R2/OAuth reais.

Este é o documento canônico para a preparação de produção. Ele substitui
instruções anteriores que apontem a origem HTTP para `192.185.176.183`.

## Origem e checkout

| Item | Valor | Estado |
| --- | --- | --- |
| Branch autorizada | `migration/laravel-backend-2026-10-02` | CONFIRMED |
| SHA local/origin | `b147c616580ee497cafbe96bbc67dc741d6d8e28` | CONFIRMED |
| Origem HTTP HostGator | `192.185.213.23` | CONFIRMED |
| SSH | `192.185.213.23:2222` / `gisley77` | CONFIRMED |
| Projeto | `/home1/gisley77/repositories/mobiliaria-gisley-nunes` | CONFIRMED |
| Document root | `/home1/gisley77/repositories/mobiliaria-gisley-nunes/public` | CONFIRMED |
| Checkout atualmente observado no HostGator | `a808885c44ed875e472e3f8252a6376410cc7bae` | STALE; não coincide com origin |
| Deploy automático | `HOSTGATOR_DEPLOY_ENABLED=false` | CONFIRMED |
| Remediação de segurança local | auditoria fail-closed + CSP allowlist | CONFIRMED |

O IP `192.185.176.183` está superseded. Não usar esse endereço em DNS,
`--resolve`, documentação operacional ou deploy.

## DNS observado

Nameservers autoritativos observados:

- `alice.ns.cloudflare.com`
- `damiete.ns.cloudflare.com`

Em 2026-10-05, consultas independentes a Cloudflare DNS, Google DNS e aos
nameservers autoritativos retornaram:

| Hostname | Resultado |
| --- | --- |
| `gisleynunesimoveis.com.br` | A `192.185.213.23` |
| `www.gisleynunesimoveis.com.br` | A `192.185.213.23` |
| `painel.gisleynunesimoveis.com.br` | A `192.185.213.23` |

Status DNS observado: `PASS` nesta sonda. Nenhum registro foi alterado nesta
rodada.

## HTTPS e AutoSSL

Os três endpoints testados por HTTPS validado responderam `HTTP 200`, `ssl=0` e
`{"status":"ok"}`. O snapshot anterior de certificado/DNS estava stale e não
deve ser usado para classificar o estado atual desses hostnames. Isso ainda não
prova que o checkout público coincide com o SHA local/origin atual.

## Aplicação e integrações

O `php artisan app:production-check` executado no checkout observado no
HostGator passou os controles básicos e falhou em:

- R2 configuration is present;
- OAuth configuration is present. O código local está preparado para Google
  OAuth, mas o checkout remoto observado ainda é anterior a essa troca.

Uma inspeção somente por nomes indicou variáveis R2/OAuth preenchidas no
`.env` remoto, sem imprimir valores. Como o checkout remoto está stale e o
runtime carregado mantém configuração incompleta, R2 e OAuth reais continuam
`BLOCKED`; nenhum upload, delete, login OAuth ou alteração de bucket foi
executado.

A troca de provider `manus -> google` não faz vínculo automático por e-mail.
Identidades antigas precisam de re-vinculação controlada por convite/bootstrap;
unir subjects de providers diferentes apenas porque o e-mail coincide seria uma
quebra do contrato de identidade.

## Gates da rodada

| Gate | Estado |
| --- | --- |
| DNS | PASS (sonda atual) |
| SSL da origem | PASS nos hostnames testados |
| HTTPS sem `-k` | PASS nos checks executados |
| PHP web | HEALTH PASS; versão/SAPI ainda não expostos |
| R2 real | BLOCKED_BY_CONFIG/SECRET |
| OAuth real | BLOCKED_BY_CONFIG/SECRET |
| Health por HTTP | PASS histórico |
| Health público por HTTPS validado | PASS nos endpoints testados |
| Cloudflare Full (strict) | BLOCKED |
| Proxy Cloudflare | não ativado |
| Trusted proxy real | não verificável sem tráfego proxied |
| Frontend público real na versão atual | NÃO VERIFICADO; SHA público não confirmado |
| Admin real | BLOCKED pelo OAuth |
| CWV real | NOT VERIFIED |
| Deploy automático | NOT ENABLED |
| Production readiness | FAIL |

## Intervenções externas necessárias

1. Criar/configurar o cliente OAuth Web no Google Cloud com o callback
   `https://painel.gisleynunesimoveis.com.br/api/auth/callback` e, sem enviar
   segredos pelo chat, preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
   `GISELY_ADMIN_BOOTSTRAP_EMAILS` no `.env` remoto após o deploy do código.
2. Configurar Cloudflare como
   `Full (strict)` e ativar proxy mediante autorização.
3. Após uma janela de deploy autorizada, publicar o SHA da branch autorizada
   pelo workflow gated. Não habilitar `HOSTGATOR_DEPLOY_ENABLED` antes de
   R2, OAuth, HTTPS e health público estarem verdes.
