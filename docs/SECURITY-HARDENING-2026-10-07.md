# Security hardening — 2026-10-07

Branch de revisão: `security/hardening-2026-10-07`

Base de produção usada nesta rodada: `migration/laravel-backend-2026-10-02` @ `2068204c6f438588686e99bcb676f9a91008c3b5`

## Regras da rodada

- Nenhum deploy é feito a partir desta branch.
- Nenhum merge em `main`.
- Nenhum segredo ou credencial é adicionado ao repositório.
- O falso positivo do ModSecurity da HostGator no callback Google OAuth é tratado como pendência de infraestrutura; não será “corrigido” enfraquecendo autenticação, CSRF ou validações.
- O backend Laravel, o painel administrativo e o fluxo privado do R2 são preservados.
- Toda nova fronteira de segurança recebe teste/contrato proporcional ao risco.

## Fase 1 — Perímetro HTTP e isolamento do painel — IMPLEMENTADA

### Por quê

O painel usa um subdomínio próprio e o build também mantém arquivos estáticos em `public/admin`. Sem uma fronteira explícita, um Host inesperado ou o arquivo físico `public/admin/index.html` poderia contornar parte da camada HTTP do Laravel.

### Correções

- `RequireKnownHost`: em produção aceita somente os hosts configurados em `APP_URL` e `ADMIN_ORIGIN`; hosts desconhecidos recebem HTTP 421.
- `RequireAdminOrigin`: a superfície administrativa/autenticação é isolada no host administrativo em produção.
- Entrada pública em `/admin` ou `/api/auth/login` é encaminhada ao host administrativo; APIs administrativas em host incorreto não são servidas.
- `public/.htaccess` força a entrada `/admin` a atravessar o front controller Laravel antes das regras que liberam arquivos/diretórios físicos e redireciona acesso direto a `/admin/index.html`.
- CSP reforçada com `script-src-attr 'none'`, `frame-src 'none'`, `worker-src 'none'` e origem R2 limitada ao account ID configurado, em vez de `*.r2.cloudflarestorage.com`.
- Headers adicionais: COOP, CORP, Origin-Agent-Cluster e X-Permitted-Cross-Domain-Policies.
- Painel e autenticação recebem `X-Robots-Tag: noindex, nofollow, noarchive`.
- HSTS continua sem `includeSubDomains` propositalmente até todos os subdomínios estarem validados em HTTPS.

### Testes

- `HttpSecurityBoundaryTest`
- `ApacheFrontControllerContractTest`
- contrato CSP em `PublicPageRenderTest`

## Fase 2 — Sessão e ciclo de acesso administrativo — IMPLEMENTADA

### Por quê

A sessão é a credencial efetiva após o OAuth. O objetivo é reduzir escopo do cookie e garantir que sessões invalidadas também sejam revogadas no banco.

### Correções

- Cookie de sessão padrão alterado para `__Host-gisley_session`.
- `app:production-check` exige prefixo `__Host-`, Secure, HttpOnly, Path=/, ausência de Domain e SameSite Lax/Strict.
- Sessões ligadas a usuário/identidade inválidos, usuário bloqueado, acesso removido/inativo ou bootstrap antigo são marcadas como revogadas no banco antes de falhar.
- Regeneração de sessão no estabelecimento de login existente foi preservada.

### Testes

- `OAuthIdentityTest` confirma revogação persistente após bloqueio.
- `ProductionCheckCommandTest` rejeita cookie administrativo com Domain.

## Fase 3 — Limites de requisição e abuso de API — IMPLEMENTADA

### Por quê

Rate limiting sem limite de corpo ainda permite gasto excessivo de memória/CPU. APIs públicas também precisam de um orçamento separado das ações administrativas.

### Correções

- Novo `LimitRequestBody` retorna HTTP 413 para corpo acima do orçamento.
- Contato: 64 KiB.
- Auth: 32 KiB para mutações.
- API administrativa: 256 KiB; uploads binários continuam diretos ao R2.
- API pública do catálogo/site: rate limit dedicado de 240 req/min por IP.
- Limites administrativos destrutivos/upload/export já existentes foram mantidos.

### Testes

- `RequestBoundaryTest` valida 413 e o throttle público dedicado.

## Fase 4 — Higiene de desafios OAuth e pareamento — IMPLEMENTADA

### Por quê

Tokens temporários já eram hashados, one-time e tinham TTL, mas registros vencidos não precisam permanecer indefinidamente.

### Correções

- Criação de novo OAuth challenge remove challenges expirados usando o índice de `expires_at_ms`.
- Criação de novo pairing remove pairings expirados.
- Consumo atômico, hashes e TTL existentes foram preservados.

### Testes

- `EphemeralAuthRecordTest`.

> Esta fase não resolve o HTTP 406 da HostGator. O 406 acontece no ModSecurity antes do Laravel.

## Fase 5 — Fronteira de mídia/R2 — IMPLEMENTADA

### Por quê

O controller já validava upload, tamanho, MIME real, dimensões e limite de pixels. A melhoria coloca a mesma fronteira crítica dentro do serviço de storage, evitando que um controller futuro consiga contorná-la.

### Correções

- Chaves R2 rejeitam leading slash, traversal, segmentos vazios, double slash, backslash, controles ASCII, caracteres fora da allowlist e prefixos fora de `gisley/properties/`.
- `presignPut` aplica allowlist de MIME de imagem no próprio serviço.
- A mesma allowlist é reutilizada na inspeção do conteúdo real.
- Limites existentes de 12 MB, 40 milhões de pixels, `If-None-Match`, parsing real da imagem e bucket privado foram preservados.

### Testes

- `UploadLifecycleTest` cobre paths ambíguos/traversal e tentativa de presign não-imagem.

## Fase 6 — Auditoria sem vazamento de segredos — IMPLEMENTADA

### Por quê

A auditoria é append-only e operações críticas já são transacionais. Faltava uma barreira genérica caso uma mudança futura envie acidentalmente tokens/senhas em `details`.

### Correções

- Sanitização recursiva antes de gravar `details`.
- Chaves como password, client_secret, access_token, refresh_token, authorization, cookie, OAuth code, pairing code e invitation token são redigidas.
- Profundidade, quantidade de itens, tamanho por string e tamanho total são limitados.
- Metadado seguro `token_stored_as_hash` continua permitido.
- Imutabilidade e rollback de mutações críticas existentes foram preservados.

### Testes

- `AuditIntegrityTest` prova que os valores sensíveis não chegam ao banco.

## Fase 7 — Supply chain, CI e gates de produção — IMPLEMENTADA

### Por quê

Segurança de aplicação perde valor se uma dependência vulnerável, credencial de CI persistida ou configuração perigosa conseguir chegar ao deploy.

### Correções

- Dependabot passou a monitorar Composer além de npm.
- Checkouts dos workflows não persistem credencial GitHub no working tree.
- `app:production-check` agora exige:
  - hosts público e administrativo HTTPS e distintos;
  - configuração OAuth presente, endpoints HTTPS e callback path válido;
  - cookie administrativo `__Host-` seguro;
  - trusted proxies sem wildcard e sem CIDR mundial `/0`.
- Scanner de segredos ampliado para Google OAuth client secret e variáveis sensíveis de banco/app/R2.
- Composer audit, pnpm audit, secret scan, PHPStan, Pint, MySQL e browser smoke permanecem gates.

### Testes

- `ProductionCheckCommandTest` cobre cookie inseguro, mesmo host público/admin, proxy mundial e endpoint OAuth inseguro.

## Fase 8 — Verificação final — EM EXECUÇÃO

Gates necessários no HEAD final:

- PHP syntax
- Pint
- PHPStan/Larastan
- PHPUnit Feature em SQLite
- PHPUnit/contratos em MySQL 8.4
- Composer audit
- production package + `app:production-check`
- frontend build/source-of-truth
- Playwright browser smoke
- Node tests
- pnpm audit
- secret scan
- CodeQL via PR de revisão

A branch só será indicada para aprovação quando os gates do HEAD final estiverem verdes. Mesmo depois da aprovação, deploy continua sendo uma ação separada e explícita.

## Pendências externas ao código

1. **HostGator ModSecurity:** o callback Google real continua recebendo HTTP 406 antes do Laravel. O suporte precisa informar a Rule ID e aplicar exceção estreita no vhost/rota, ou desativar temporariamente apenas para comprovação.
2. **SSH HostGator:** a porta 2222 aceita TCP, mas o servidor respondeu `Not allowed at this time` antes da autenticação. É restrição do host.
3. **Header CORS do Apache:** em teste de produção foi observado `Access-Control-Allow-Origin: *` mesmo sem o Laravel definir esse header. Deve ser confirmado na camada HostGator/Apache antes de alterar `.htaccess` às cegas.

## Status

- [x] Fase 1 — perímetro HTTP/admin
- [x] Fase 2 — sessão/acesso
- [x] Fase 3 — limites/abuso
- [x] Fase 4 — efêmeros OAuth/pairing
- [x] Fase 5 — R2/mídia
- [x] Fase 6 — auditoria
- [x] Fase 7 — supply chain/gates
- [ ] Fase 8 — todos os gates do HEAD final + PR draft
