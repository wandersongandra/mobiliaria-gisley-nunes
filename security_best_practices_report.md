# Security best-practices audit — Gisley Nunes Imóveis

Data da auditoria: 2026-10-06 (America/Sao_Paulo)

## Resumo executivo

Não foi confirmada vulnerabilidade crítica ou alta de bypass de autenticação, autorização, SQL injection, XSS armazenado ou path traversal no código revisado. A trilha de auditoria fail-closed e o CSP com allowlist explícita foram corrigidos e validados localmente. O resultado operacional ainda é `NO-GO` para uma declaração de segurança completa porque o gate de entrega HostGator não está ativo, o check externo Workers Builds está falhando e os fluxos OAuth/R2/proxy reais não foram exercitados ponta a ponta.

## Escopo e evidências

- Runtime Laravel/PHP: `app/`, `routes/`, `config/`, `resources/views/`, `database/migrations/`.
- Runtime Node/Express e preview: `server/`, `public/`, `src/`, `views/`, `wrangler.jsonc`.
- CI/CD e entrega: `.github/workflows/`, `scripts/deploy-hostgator.sh`.
- Integrações: Google OAuth, MySQL, Cloudflare R2, HostGator e preview Cloudflare.
- Dados em escopo: leads, identidades administrativas, sessões, convites, fotos e configuração pública do site.
- `CONFIRMED`: observado no código, teste local, CI remoto ou probe HTTP atual.
- `INFERRED`: conclusão derivada do desenho, ainda sem exercício live equivalente.
- `NÃO VERIFICADO`: depende de operador, provedor ou infraestrutura real não exercitada.
- `BLOCKED`: check não executável no ambiente atual.

## Achados por severidade

### MEDIUM

#### SBP-001 — Trilha de auditoria falha aberta em mutações administrativas — REMEDIADO NO CÓDIGO

- **Localização:** `app/Http/Controllers/Concerns/AdminRequestContext.php:33-46`; `app/Http/Controllers/AuthController.php:309-325`.
- **Evidência anterior:** `audit()` e a trilha de autenticação capturavam exceções e permitiam continuidade. Criação/edição de imóvel, mídia, leads e exportação não estavam todos em uma fronteira fail-closed.
- **Impacto:** se o banco ou a escrita do log estiver indisponível, uma operação administrativa pode ser confirmada sem registro confiável. Isso reduz detecção, investigação e capacidade de atribuir exportação, alteração ou login a um operador.
- **Exploração:** um administrador comprometido executa uma mutação durante uma indisponibilidade deliberada ou acidental do log; a alteração persiste e a trilha fica incompleta.
- **Correção aplicada:** mutações administrativas foram movidas para `CriticalAuditService`; exportação falha antes de emitir PII; login revoga a sessão se a auditoria falhar; logout retorna erro controlado após revogar a sessão. A criação de entidade deriva o ID auditado após a mutação.
- **Validação:** `phpunit` completo, teste de rollback transacional e teste de derivação de entidade passaram.
- **Prioridade:** medium.

#### SBP-002 — Gate de entrega não está disponível como workflow ativo e há check externo falhando

- **Localização:** `.github/workflows/hostgator-deploy-gated.yml:1-32`; `scripts/deploy-hostgator.sh:26-81`; `wrangler.jsonc:1-9`.
- **Evidência:** o workflow local exige branch, SHA, confirmação, environment e known hosts estrito, mas `gh workflow list --all` no repositório remoto mostrou apenas `CI`, `CodeQL`, `Laravel CI` e `Laravel production package`. A PR #3 está `UNSTABLE` por `Workers Builds: mobiliaria-gisley-nunes` com conclusão `FAILURE`.
- **Impacto:** o caminho automatizado de entrega não é um controle efetivo até estar registrado no branch operacional; o fallback operacional pode depender de SSH manual. O check Cloudflare falho também impede usar a PR como evidência de release íntegra.
- **Correção recomendada:** publicar o workflow gated no branch padrão, tornar o environment de produção obrigatório, configurar required checks e separar explicitamente preview Cloudflare de produção HostGator. Não liberar merge/deploy enquanto o check externo falhar ou estiver sem escopo documentado.
- **Mitigação:** manter `HOSTGATOR_DEPLOY_ENABLED=false`, usar o script SHA-locked com `StrictHostKeyChecking=yes`, registrar operador, SHA, janela e health check em cada exceção manual.
- **Prioridade:** medium; risco de governança e integridade de release, não bypass HTTP confirmado.

#### SBP-003 — Provas ponta a ponta de OAuth, R2 e proxy real permanecem incompletas

- **Localização:** `app/Http/Controllers/AuthController.php:76-179,234-291`; `app/Services/R2Storage.php:33-247`; `app/Http/Middleware/ConfigureTrustedProxies.php:11-27`.
- **Evidência:** o código valida state, callback, e-mail verificado, MIME, dimensões, prefixo e ownership. As probes atuais confirmaram health `200` e o redirecionamento de login para Google, mas não completaram callback com operador autorizado, upload/download controlado no R2, nem tráfego proxied com spoof de `X-Forwarded-*`.
- **Impacto:** um health check verde não prova autorização real, armazenamento privado, revogação de sessão ou comportamento do proxy na topologia final.
- **Correção recomendada:** executar em janela controlada um fluxo OAuth completo sem imprimir tokens, um smoke R2 não destrutivo com objeto de teste, e testes proxied de host/origin/IP. Registrar evidência, timestamp, SHA e ambiente.
- **Mitigação:** manter `app:production-check` fail-closed, não declarar `PASS` global por health isolado e manter o deploy gated desabilitado até os testes.
- **Prioridade:** medium, como bloqueio de evidência e readiness.

### LOW

#### SBP-004 — CSP permite mídia de qualquer origem HTTPS no Laravel — REMEDIADO NO CÓDIGO

- **Localização:** `app/Http/Middleware/SecurityHeaders.php:27-35`.
- **Evidência anterior:** `img-src 'self' https: data: blob:` e `media-src 'self' https:` eram mais amplos que os hosts necessários.
- **Impacto:** se uma URL externa controlada por operador ou dado persistido alcançar uma tag de mídia, o navegador poderá fazer requisições para qualquer host HTTPS. O código atual restringe os caminhos de fotos a R2, portanto não há exploração confirmada.
- **Correção aplicada:** `img-src` aceita apenas origem local, Unsplash e R2; `media-src` aceita apenas origem local e R2. `data:`/`blob:` permanecem somente em imagens por compatibilidade com o frontend.
- **Validação:** teste de CSP explícito passou.

#### SBP-005 — Documentação operacional está desatualizada em relação ao checkout atual — REMEDIADO

- **Localização:** `docs/CURRENT-PRODUCTION-STATE.md:19-26,59-96`; `docs/PHASE7-PRODUCTION-READINESS.md:24-32`.
- **Correção aplicada:** `docs/CURRENT-PRODUCTION-STATE.md` e `docs/PHASE7-PRODUCTION-READINESS.md` foram atualizados para o SHA local/origin `b147c616580ee497cafbe96bbc67dc741d6d8e28`, preservando explicitamente os limites das provas externas.
- **Validação:** revisão de diff e `git diff --check`.

## Controles confirmados

- `server/security.js:67-79,271-293`: CSRF por cookie/header e same-origin para mutações Node.
- `app/Http/Middleware/RequireSameOrigin.php:11-43`: origem/referer obrigatório e allowlist configurada.
- `app/Http/Middleware/SecurityHeaders.php:21-45`: CSP, frame denial, nosniff, referrer policy, permissions policy e HSTS.
- `app/Services/AdminAccessService.php:78-146`: sessão server-side, expiração, idle timeout, bloqueio de usuário, subject OAuth e capability derivada do servidor.
- `app/Http/Middleware/RequireAdmin.php:14-28` e `RequireCapability.php:14-22`: autenticação e autorização no backend.
- `app/Services/R2Storage.php:63-85,204-247`: prefixo, rejeição de traversal, MIME real, dimensões e limite de pixels.
- `app/Http/Controllers/AuthController.php:82-101,274-291`: state de uso único, redirect URI fixo e e-mail verificado.
- `app/Providers/AppServiceProvider.php:24-54`: rate limits para contato, login, callback, admin, upload, export e ações destrutivas.
- `scripts/scan-secrets.mjs`: secret scan local passou.
- `pnpm audit --prod --audit-level=moderate`: sem vulnerabilidades conhecidas no conjunto Node auditado.
- CI remoto da PR #3: CodeQL, Laravel CI, production-build, frontend e security concluíram com sucesso; isso não cobre os gaps live acima.

## Limitações da auditoria

- Composer audit local ficou `BLOCKED` porque `composer` não está no PATH; o check equivalente do CI remoto passou.
- Não foram lidos valores de `.env`, chaves, cookies ou tokens.
- Não foi executada ação destrutiva, migration, alteração de DNS, alteração de proxy, upload em bucket produtivo ou login OAuth completo.
- Health HTTP confirma disponibilidade do endpoint observado, não integridade do SHA público, autorização, backup/restauração ou DR.

## Veredito

**Código:** sem vulnerabilidade crítica/alta confirmada nesta auditoria estática e nos testes executados.

**Readiness de segurança:** `NO-GO` até tornar o gate de release efetivo, resolver o check Workers Builds e obter evidência ponta a ponta de OAuth, R2 e proxy.

As correções locais foram aplicadas após a auditoria e validadas pelos checks descritos acima. Publicação, ativação de workflow e provas externas continuam pendentes.
