# Estado operacional atual — Gisley Nunes Imóveis

Data da verificação: 2026-10-05 (America/Sao_Paulo)

Este é o documento canônico para a preparação de produção. Ele substitui
instruções anteriores que apontem a origem HTTP para `192.185.176.183`.

## Origem e checkout

| Item | Valor | Estado |
| --- | --- | --- |
| Branch autorizada | `migration/laravel-backend-2026-10-02` | CONFIRMED |
| SHA local/origin | `5a286fca8bccb473f12d5b1594ffe27e6c11b516` | CONFIRMED |
| Origem HTTP HostGator | `192.185.213.23` | CONFIRMED |
| SSH | `192.185.213.23:2222` / `gisley77` | CONFIRMED |
| Projeto | `/home1/gisley77/repositories/mobiliaria-gisley-nunes` | CONFIRMED |
| Document root | `/home1/gisley77/repositories/mobiliaria-gisley-nunes/public` | CONFIRMED |
| Checkout atualmente observado no HostGator | `a808885c44ed875e472e3f8252a6376410cc7bae` | STALE; não coincide com origin |
| Deploy automático | `HOSTGATOR_DEPLOY_ENABLED=false` | CONFIRMED |

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
| `painel.gisleynunesimoveis.com.br` | NXDOMAIN |

Status DNS: `WAITING_PROPAGATION` / configuração incompleta para `painel`.
Nenhum registro foi alterado nesta rodada.

## HTTPS e AutoSSL

HTTP para `@` e `www` chega ao Laravel. HTTPS sem `-k` falha com erro de
principal incorreto. O certificado observado por SNI:

- `@` e `www`: Let's Encrypt, mas SAN somente para o hostname temporário
  `*.meusitehostgator.com.br` da conta;
- `painel`: certificado wildcard `*.hostgator.com.br`.

Nenhum dos certificados cobre os hostnames públicos do projeto. Status:
`BLOCKED_AUTOSSL`.

O teste com `-k` foi usado somente para diagnóstico; não é evidência de SSL
válido. Os endpoints retornaram `{"status":"ok"}` nesse diagnóstico, mas a
prova final precisa ser feita por HTTPS validado sem `-k`.

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

## Gates da rodada

| Gate | Estado |
| --- | --- |
| DNS | WAITING |
| SSL da origem | BLOCKED |
| HTTPS sem `-k` | FAIL |
| PHP web | NÃO VERIFICADO; versão/SAPI não foram expostos por `phpinfo` |
| R2 real | BLOCKED_BY_CONFIG/SECRET |
| OAuth real | BLOCKED_BY_CONFIG/SECRET |
| Health por HTTP | diagnóstico PASS |
| Health público por HTTPS validado | BLOCKED |
| Cloudflare Full (strict) | BLOCKED |
| Proxy Cloudflare | não ativado |
| Trusted proxy real | não verificável sem tráfego proxied |
| Frontend público real | BLOCKED pelo HTTPS/origem stale |
| Admin real | BLOCKED pelo OAuth |
| CWV real | NOT VERIFIED |
| Deploy automático | NOT ENABLED |
| Production readiness | FAIL |

## Intervenções externas necessárias

1. No Cloudflare DNS da zona `gisleynunesimoveis.com.br`, criar ou confirmar
   `A painel -> 192.185.213.23`, mantendo DNS only durante o AutoSSL. Não usar
   `192.185.176.183`.
2. No cPanel/HostGator, executar ou solicitar AutoSSL para
   `gisleynunesimoveis.com.br`, `www.gisleynunesimoveis.com.br` e
   `painel.gisleynunesimoveis.com.br`, todos com o document root confirmado.
3. Criar/configurar o cliente OAuth Web no Google Cloud com o callback
   `https://www.gisleynunesimoveis.com.br/api/auth/callback` e, sem enviar
   segredos pelo chat, preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
   `GISELY_ADMIN_BOOTSTRAP_EMAILS` no `.env` remoto após o deploy do código.
4. Somente depois do certificado válido, configurar Cloudflare como
   `Full (strict)` e ativar proxy mediante autorização.
5. Após uma janela de deploy autorizada, publicar o SHA da branch autorizada
   pelo workflow gated. Não habilitar `HOSTGATOR_DEPLOY_ENABLED` antes de
   R2, OAuth, HTTPS e health público estarem verdes.
