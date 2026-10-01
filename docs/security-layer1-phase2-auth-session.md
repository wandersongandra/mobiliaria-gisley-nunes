# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch de trabalho: `security/layer1-phase2-auth`
Escopo: OAuth, cookies, JWT, sessão server-side, revogação, vínculo de identidade e erros de autenticação. Fase 3 não foi executada.

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

## Resultado dos Testes

- `pnpm test`: **PASS — 163 aprovados, 1 integração MySQL ignorada por falta de banco**.
- `pnpm build`: **PASS — Vite production build**.
- `git diff --check`: **PASS**.
- `pnpm security:secrets`: **PASS**; fixtures históricas sintéticas são reconhecidas por fingerprint e caminho permitido, sem revelar valores.
- `pnpm test:mysql`: **PASS — 1/1** em MySQL 8.4.9 temporário, bind exclusivo em loopback e schema novo `gisley_phase2_test`. Validou consumo concorrente de OAuth state, rollback de pairing em conflito, vínculo concorrente, oito criações concorrentes de sessão, limite de três sessões e revogação.
- A primeira execução MySQL reproduziu o deadlock F2-12; após mover a retenção para fora da transação, a nova execução no schema isolado passou.
- CI remoto: **PASS** no commit-base consultado `20631be213f45b57f72ebb482e627e7e7dbbf144` (run `36914254751`); esse resultado antecede as alterações locais desta retomada. Neste checkout, `pnpm test` passou com 163 testes e 1 integração MySQL ignorada por falta de servidor.
- Foi adicionado job dedicado com MySQL 8.4 efêmero e teste de integração protegido para schema vazio `gisley_phase2_test`; execução do novo job remoto: **NÃO VERIFICADA**, pois as alterações ainda estão apenas locais.
- CodeQL workflow: **PASS** no commit-base (run `36914254733`), mas o gate do PR associado reportou **FAIL: 13 alertas novos (11 HIGH, 2 MEDIUM)**. As anotações recuperadas apontam duas ocorrências de HTML dinâmico em `admin/main.js` que escapam o nome do arquivo com `escapeHTML`; alertas de CSRF cobertos pelos guards `requireSameOrigin`/`requireAdminOrigin`; alertas de cookie em `server/auth.js` atendidos por `cookieOptions` (`httpOnly` e `secure`); e alertas de rate limit em login, callback, logout e sonda, dos quais logout estava sem limiter. Adicionei um limiter compartilhado de 60 chamadas/5 minutos para logout e logout-all, com teste HTTP para 429. A avaliação CodeQL posterior a essas alterações segue **NÃO VERIFICADA**.
- Check externo Cloudflare Workers: **FAIL** no commit consultado; logs de build não estavam acessíveis pela integração atual. Não é evidência suficiente para atribuir a falha à Fase 2.
- Provedor OAuth real: **NÃO VERIFICADO/BLOCKED**; não há configuração OAuth de teste neste checkout.

## Checklist de Aprovação

- [x] OAuth PASS — validação de state, cookie, redirect URI e consumo único comprovados estaticamente/unitariamente.
- [x] JWT PASS — assinatura, algoritmo, issuer, audience, `sub`, `jti`, `iat`, `exp`, adulteração e futuro cobertos.
- [x] Cookies PASS — `__Host-`, HttpOnly, Secure, SameSite, Path e maxAge cobertos.
- [x] Server-side Session PASS — runtime MySQL 8.4.9 de teste validou criação, estado e revogação.
- [x] Revocation PASS — JTI, logout, logout-all, alteração/remoção de acesso e expiração cobertos em código/testes.
- [x] Identity Binding PASS — OpenID/e-mail/acesso ativo e pairing atômico cobertos.
- [x] Session Fixation PASS — novo JTI após login e revogação do token anterior.
- [x] Concurrent Sessions PASS — oito sessões simultâneas respeitaram limite de três no MySQL de teste.
- [x] Idle Timeout PASS — configuração limitada e estados active/revoked/absolute/idle cobertos.
- [x] Auth Error Leakage PASS — respostas opacas para erros internos e logs sem token/secret observado.
- [x] Tests PASS — 163 testes locais e integração MySQL 1/1 passaram; o job CI remoto ainda não rodou sobre estas alterações. Secret scan local PASS.

## Conclusão

**CAMADA 1 — FASE 2: FAIL**

O gate remoto ainda precisa rodar sobre estas alterações. A Fase 2 permanece `FAIL` até fechar estes blockers:

1. O job CI/CodeQL precisa rodar sobre o branch atualizado; a execução MySQL local passou, mas o resultado remoto ainda não está disponível.
2. O gate CodeQL reportou 13 alertas no PR anterior. A anotação de logout foi corrigida localmente; os alertas de wrappers precisam ser reavaliados no novo resultado.
3. A integração OAuth real ainda precisa ser validada com configuração e identidade de teste do provedor.

Nenhuma alteração da Fase 3 foi realizada.
