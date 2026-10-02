# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch revisada no GitHub: `audit/security-design-2026-09-30`  
SHA independente de validação: `cdf1a86cb6ac8909656cd01862c06faf10ac9933`  
Escopo: OAuth, cookies, JWT, sessão server-side, revogação, vínculo de identidade, CSRF, rate limiting e erros de autenticação. Este relatório avalia somente a Fase 2, mesmo que a branch contenha commits posteriores de outras frentes.

## Superfície Analisada

- `server/auth.js`: `/api/auth/login`, `/api/auth/callback`, logout, logout-all, cookies, OAuth state, JWT, resolução de identidade e sessão.
- `server/db.js`: `morada_auth_challenges`, `morada_identity_pairings`, `morada_admin_sessions`, locks transacionais, revogação, `last_seen_at_ms` e retenção.
- `server/config.js`: segredo de sessão, origens canônicas, timeout ocioso e limite de sessões.
- `server/routes.js`: guards de origem, rate limit, session probe, pairing e logout.
- `server/security.js` e `server/index.js`: host/origin, cookies atrás de proxy, headers e tratamento de erros.
- Testes em `test/auth.test.js`, `test/auth-session.test.js`, `test/auth-session-contract.test.js`, `test/session-security.test.js`, `test/session-config.test.js`, `test/errors.test.js`, `test/routes.test.js` e `test/security*.test.js`.
- `docs/security-layer1-phase1-surface.md`: preservação dos guards e da separação entre domínio público e painel.

## Matriz de Achados

| ID | Vetor | Severidade | Evidência | Correção Implementada | Teste Criado |
|---|---|---|---|---|---|
| F2-01 | OAuth input coercion | Medium | `server/auth.js:374-379` recebia `code`/`state` por coerção genérica com `String(...)`. Arrays e valores não escalares podiam entrar no fluxo de validação. | Validação escalar e canônica: state base64url de 43 caracteres; code ASCII visível, não vazio e limitado a 4096 caracteres. | `test/auth.test.js:71-84` |
| F2-02 | OAuth state/replay | High | `server/db.js:850-877` consome o challenge em transação, com `SELECT ... FOR UPDATE`, remoção e `commit`; `state_hash` é chave primária em `server/db.js:116-122`. | Uso único, hash SHA-256 no banco, cookie HttpOnly e redirect URI persistida/revalidada. | `test/auth-session-contract.test.js:15-26`; testes de state em `test/auth.test.js` e `test/auth-session.test.js` |
| F2-03 | Cookies | High | `server/auth.js:26-48` usa prefixo `__Host-` em produção, `HttpOnly`, `Secure`, `Path=/`, sem `Domain`; state OAuth é `SameSite=Lax` somente no retorno top-level. | Mantido `SameSite=Strict` para sessão e `Lax` restrito ao state OAuth, com `maxAge` explícito. | `test/auth.test.js:145-186`, `test/auth-session.test.js:140-165` |
| F2-04 | JWT validation | High | `server/auth.js:165-185` restringe `HS256`, issuer, audience, `typ`, idade máxima, clock tolerance e claims temporais. | Mantida allowlist de algoritmo e adicionada validação explícita de algoritmo diferente. | `test/auth.test.js:225-304`; `test/auth-session.test.js:29-78` |
| F2-05 | Server-side session binding | High | `server/auth.js:224-244` exige correspondência entre `sub`, `jti`, OpenID, e-mail, usuário e acesso ativo; `server/db.js:948-979` aplica expiração absoluta e idle timeout. | JWT válido isoladamente não autentica; sessão é consultada e inválida é revogada/limpa do cookie. | `test/auth.test.js:348-407`; `test/session-security.test.js:5-20` |
| F2-06 | Identity pairing replay/race | High | `server/db.js:757-837` usa transação, `FOR UPDATE`, constraints únicas, valida e-mail/OpenID e remove o hash somente após o vínculo. | Pairing de 96 bits armazenado apenas como SHA-256, validade de 15 minutos e consumo único atômico. | `test/auth-session-contract.test.js:28-40`; `test/validation.test.js:79-95` |
| F2-07 | Session fixation/concurrent sessions | High | `server/auth.js:421-433` revoga JTI anterior e emite novo JTI; `server/db.js:897-929` serializa a identidade com `FOR UPDATE` e revoga sessões excedentes. | Sessão pré-login não é reaproveitada; limite configurável de 1 a 10, default 3. | `test/auth-session-contract.test.js:42-53`; `test/session-config.test.js:5-35` |
| F2-08 | Error leakage | Medium | `server/auth.js:438-440` retorna mensagem genérica em falhas inesperadas; `server/errors.js:66-70` devolve códigos opacos em produção. | Mantido detalhe apenas em log interno e contrato genérico para erro interno. | `test/errors.test.js:25-70`; `test/routes.test.js:93-117` |
| F2-09 | Baseline de teste regressivo | Low | `test/access-policy.test.js` procurava uma assinatura antiga do guard global e falhava apesar da ordem atual estar correta. | Teste ajustado para validar a cadeia real sem relaxar o guard. | `test/access-policy.test.js:47-63` |
| F2-10 | Secret scan histórico | Operational | O scanner detectava fixtures sintéticas históricas sem distinguir caminho de teste de código de produção. | Fingerprints sintéticos foram aceitos somente em `test/` e `.env.example`; nenhum fingerprint é aceito globalmente. | `pnpm security:secrets` — PASS |
| F2-11 | Logout sem rate limit | Não atribuída pela anotação CodeQL | `server/routes.js` expunha `/api/auth/logout` sem limiter dedicado; logout-all também não tinha limiter próprio. | Adicionado limiter compartilhado de 60 chamadas por 5 minutos após validação de origem. | `test/routes.test.js` confirma 429 após o limite; `test/access-policy.test.js` confirma ordem dos guards |
| F2-12 | Deadlock na criação concorrente de sessão | Medium | MySQL 8.4.9 reproduziu `ER_LOCK_DEADLOCK`: a limpeza global mantinha gap lock enquanto a transação aguardava a linha da identidade, formando ciclo com outra inserção de sessão. | Limpezas de retenção passaram para antes da transação; lock da identidade e aplicação do limite seguem atômicos. | `pnpm test:mysql` — PASS com 8 criações concorrentes |

| F2-13 | CSRF administrativo | High | O controle original de mesma origem bloqueava ataques cross-origin, porém não havia um token anti-CSRF independente ligado ao navegador. O Advanced Security também não conseguia modelar o guard customizado. | Adicionado double-submit token de 256 bits: cookie `__Host-gisley_csrf` em produção, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, comparação em tempo constante e header `X-CSRF-Token`. O controle de `Origin`/`Sec-Fetch-Site` foi mantido como defesa adicional. Token é rotacionado no login e removido no logout/logout-all. | Testes HTTP cobrem ausência, divergência e token válido; testes de autorização atravessam CSRF válido antes de verificar capabilities. |
| F2-14 | Rate limiting reconhecível e defesa em profundidade | High | O projeto já possuía limites customizados por IP/rota, porém a query `js/missing-rate-limiting` do CodeQL não conseguia modelá-los e o guard global não tinha uma implementação padrão independente. | Mantidos todos os limites específicos existentes e adicionada barreira global com `express-rate-limit@8.7.0` para `/api`, limite alto de segurança, headers padrão e chave normalizada com `ipKeyGenerator`. | CI e Advanced Security reexecutados; alertas High do PR caíram a zero. |
| F2-15 | Dependência transitiva do limiter | High | A primeira resolução de `express-rate-limit@8.7.0` fixou `ip-address@10.2.0`, atingida pelo advisory `GHSA-mwp4-54f8-5fhr`. O gate `pnpm audit --prod --audit-level=high` falhou. | Lockfile atualizado para `ip-address@10.5.0`, compatível com o range do pacote e acima da versão corrigida mínima. | Frozen install PASS e production dependency audit PASS no CI. |

## Resultado dos Testes

Validação independente no SHA `cdf1a86cb6ac8909656cd01862c06faf10ac9933`:

- `pnpm test` no CI: **169 aprovados, 0 falhas, 1 teste MySQL ignorado no job geral**.
- Job `auth-mysql-integration`: **PASS** com MySQL efêmero autorizado no GitHub Actions.
- `pnpm build`: **PASS**.
- `pnpm security:secrets`: **PASS**.
- Syntax check: **PASS**.
- Build do preview: **PASS**.
- Docker build: **PASS**.
- `pnpm audit --prod --audit-level=high`: **PASS**; permanecem **4 advisories Moderate** a serem inventariados/avaliados separadamente.
- Workflow CodeQL `analyze`: **PASS**.
- GitHub Advanced Security / CodeQL PR gate: **PASS**, sem novos alertas High bloqueando o PR.
- Os alertas de CSRF e rate limiting foram resolvidos com controles efetivos; nenhuma suppression/ignore foi adicionada para forçar verde.
- O scan identificou inicialmente um advisory High transitivo em `ip-address@10.2.0`; a resolução foi corrigida para `10.5.0` e o gate High voltou a passar.
- Cloudflare Workers/Preview: o pipeline externo continua **intermitente**. Houve deployment bem-sucedido do SHA `7a704826`, enquanto um build posterior do SHA final reportou falha sem log disponível por esta integração. Isso é tratado como pendência de infraestrutura, não como evidência de falha da autenticação.
- Provedor OAuth real end-to-end: **ADIADO / NÃO VERIFICADO**. O usuário informou que atualmente mantém apenas o site público no Cloudflare; a hospedagem do backend e o ambiente para validação serão definidos depois.

## Checklist de Aprovação

- [x] OAuth — validação de state, challenge, redirect URI e replay coberta unitária/integração de banco.
- [x] JWT — algoritmo, assinatura, issuer, audience, claims temporais, JTI e adulteração cobertos.
- [x] Cookies — `__Host-`, HttpOnly, Secure, SameSite, Path e ciclo de vida cobertos.
- [x] Server-side Session — runtime MySQL efêmero validado no CI.
- [x] Revocation — JTI, logout, logout-all e alteração/remoção de acesso cobertos.
- [x] Identity Binding / Pairing — vínculo atômico e replay cobertos.
- [x] Session Fixation — novo JTI e revogação do anterior.
- [x] Concurrent Sessions — limite validado em MySQL concorrente.
- [x] Idle Timeout — estados de expiração e inatividade cobertos.
- [x] CSRF — same-origin + double-submit token independente.
- [x] Rate Limit — barreira padrão + limites específicos por rota.
- [x] Error Leakage — respostas opacas e logs sem credenciais observadas.
- [x] Secret Scan — PASS.
- [x] Production Audit High/Critical — PASS.
- [x] Tests / Build / Docker — PASS.
- [x] CI — PASS.
- [x] CodeQL workflow — PASS.
- [x] GitHub Advanced Security gate — PASS.
- [ ] OAuth real end-to-end com provider e identidade de teste autorizados — **ADIADO**, aguardando hospedagem do backend e ambiente de teste.
- [ ] Advisories Moderate de dependências — **4 pendentes de inventário/triagem**, sem High/Critical no gate atual.
- [ ] Pipeline Cloudflare Preview/Workers intermitente — **pendência operacional externa à autenticação**.

## Conclusão

**CAMADA 1 — FASE 2: NO-GO OPERACIONAL**

A implementação e os gates automatizados da Fase 2 estão tecnicamente aprovados no SHA `cdf1a86cb6ac8909656cd01862c06faf10ac9933`: testes, MySQL, secret scan, build, Docker, CodeQL e GitHub Advanced Security passaram, e não há blocker Critical/High conhecido no código desta fase.

O resultado global permanece **NO-GO** porque o critério acordado exige validação OAuth real ponta a ponta antes de declarar `PASS`. Também permanecem como riscos residuais quatro advisories Moderate de dependências e a instabilidade do pipeline externo do Cloudflare, que devem ser tratados/documentados antes do go-live.

Não houve merge na `main`.

## Continuação da Fase 2 — 2026-10-02

Durante a retomada da Fase 2, uma nova execução do audit de produção identificou quatro advisories moderados em `ip-address@10.5.0`, dependência transitiva de `express-rate-limit`. O requisito corrigido começa em `10.7.1`.

- O lockfile foi atualizado para `ip-address@10.7.3`; `package.json` e os limites de versão diretos não mudaram.
- `pnpm audit --prod --audit-level=moderate` (pnpm 10.4.1): **PASS — nenhum advisory conhecido**.
- `pnpm test`: **169 aprovados, 0 falhas, 1 teste MySQL ignorado** por não haver serviço MySQL local.
- `pnpm build`: **PASS**.
- A CI e o CodeQL do HEAD remoto anterior (`06832527ff4ba5cb572e27386618ef517ab91dae`) passaram. Esses resultados antecedem esta alteração do lockfile e precisam ser renovados após ela.
- A varredura local de segredos históricos não terminou: o clone filtrado precisou buscar blobs antigos durante `git log -p`. A CI do HEAD remoto anterior já tinha esse gate aprovado; como o scanner exclui o lockfile, esta mudança não altera a superfície que ele verifica.

O usuário esclareceu que, no momento, somente o site público está hospedado no Cloudflare; ainda não há plataforma para hospedar o backend nem ambiente de validação. A validação OAuth ponta a ponta fica adiada até essa infraestrutura ser definida. Isso é uma pendência operacional pré-produção, não uma falha confirmada no código.

O resultado da Fase 2 permanece **NO-GO para produção** até a validação OAuth ponta a ponta. A PR #1 segue em modo draft; não houve merge na `main` nem publicação.
