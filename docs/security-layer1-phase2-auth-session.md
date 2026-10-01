# Camada 1 — Fase 2: Autenticação e sessão

Data: 2026-10-01
Branch: `audit/security-design-2026-09-30`

## Escopo

Revisão de OAuth, state/nonce, cookies, JWT, sessão server-side, expiração, inatividade, revogação, troca de papel, remoção de acesso, pairing de identidade e logout global.

## Arquitetura validada

- JWT administrativo assinado com HS256.
- JWT contém identidade e `jti`, não papel/permissão.
- Papel é resolvido novamente no banco a cada requisição.
- Sessão possui registro server-side em `morada_admin_sessions`.
- Sessão tem expiração absoluta de 8h e timeout de inatividade configurável.
- Sessão revogada deixa de ser aceita mesmo se o cookie/JWT ainda existir.
- Mudança/removal de usuário revoga sessões da identidade.
- Managers bootstrap são vinculados por OpenID, não apenas por e-mail.
- OAuth state é aleatório, armazenado apenas como hash no banco e consumido uma única vez.
- Cookie de state é HttpOnly/Secure em produção e SameSite=Lax para suportar callback OAuth.
- Cookie de sessão é HttpOnly/Secure, host-only em produção e SameSite=Strict.
- Pairing de identidade usa código aleatório de alta entropia, hash no banco, TTL curto e consumo único.

## Achados

### F2-01 — Validação estrutural do JWT poderia ser mais defensiva
Severidade: Baixa
Status: Corrigido

Foram adicionados limites e validação explícita de:
- tamanho máximo do token;
- três segmentos JWT;
- subject sem espaços e <= 191 chars;
- `jti` em formato UUID;
- `iat` não futuro além da tolerância;
- `exp` válido;
- janela absoluta não superior ao TTL permitido.

### F2-02 — Cookie administrativo inválido permanecia no navegador
Severidade: Baixa
Status: Corrigido

A sonda `/api/admin/session` agora limpa imediatamente o cookie quando a sessão não é mais válida.

### F2-03 — Logout global reimplementava autenticação
Severidade: Baixa
Status: Corrigido

`POST /api/auth/logout-all` agora passa pelo mesmo `requireAdmin()` usado no CRM antes de revogar todas as sessões.

### F2-04 — Headers de autenticação estavam espalhados
Severidade: Baixa
Status: Corrigido

Todas as rotas `/api/auth/*` agora recebem centralmente:
- `Cache-Control: no-store`;
- `Pragma: no-cache`;
- `Referrer-Policy: no-referrer`.

### F2-05 — Pairing concorrente permitia mais de um código para o mesmo e-mail
Severidade: Média-baixa
Status: Corrigido

A tabela de pairing agora garante unicidade por:
- `open_id`;
- `email`.

Migração remove duplicatas antigas antes de criar o índice único.

## Testes adicionados

- JWT adulterado;
- JWT expirado;
- JWT com claims inválidos;
- JWT gigante/malformado;
- comparação de state em tempo constante;
- cookies administrativos;
- prefixos `__Host-` em produção;
- logout global sem sessão;
- headers no-store/no-referrer;
- limpeza de cookie administrativo inválido.

## PKCE

Foi pesquisado o fluxo público do provedor OAuth utilizado. Os exemplos públicos encontrados para `WebDevAuthPublicService/ExchangeToken` usam `clientId`, `grantType`, `code` e `redirectUri`, sem parâmetro documentado de `code_verifier`. Por compatibilidade, PKCE não foi inventado do lado do cliente.

## Gate da Fase 2

PASS quando:
- CI verde;
- CodeQL verde;
- JWT adversarial PASS;
- state OAuth single-use PASS;
- sessão revogada PASS;
- cookie inválido limpo PASS;
- mudança de papel/acesso revalidada no banco PASS;
- logout global protegido PASS;
- pairing single-use e único por identidade/e-mail PASS.

## Próxima fase

Fase 3 — Autorização e privilégio mínimo:
- Editor tentando promover a si mesmo;
- Editor tentando publicar/arquivar;
- acesso direto a endpoints de Gestor;
- manipulação de IDs;
- ações sobre recursos fora do escopo permitido;
- permissões no frontend versus backend.
