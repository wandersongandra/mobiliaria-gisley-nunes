# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que autenticação, sessão, revogação e vínculo de identidade administrativa sejam resistentes a replay, fixation, reutilização de token, alteração de papel e falhas parciais de backend.

## Arquitetura validada

- OAuth externo para autenticação inicial;
- OpenID como identidade estável;
- JWT assinado com HS256 contendo apenas `sub` e `jti`;
- issuer e audience fixos;
- sessão também registrada server-side por JTI;
- expiração absoluta de 8 horas;
- timeout de inatividade configurável;
- limite de sessões concorrentes;
- papel/permissão recalculados no backend a cada requisição;
- revogação de sessão ao alterar/remover acesso;
- estado OAuth randômico de 256 bits, salvo apenas como hash no banco e consumido uma única vez.

## Achados e correções

### F2-01 — Logout podia manter cookie local em falha de revogação
**Severidade:** Média  
**Status:** Corrigido

Antes, se a revogação no banco falhasse, o cookie permanecia no navegador.

**Correção:** logout local agora sempre limpa o cookie. Falha de revogação remota continua retornando erro explícito, mas o navegador não mantém a credencial.

### F2-02 — Logout global podia falhar antes de limpar o navegador
**Severidade:** Média  
**Status:** Corrigido

A rota usava middleware autenticado antes de chegar ao handler de logout global.

**Correção:** o próprio handler resolve a identidade e sempre limpa a sessão local, mesmo quando o backend de sessão apresenta falha.

### F2-03 — Sessão inválida permanecia no navegador
**Severidade:** Baixa  
**Status:** Corrigido

Quando uma rota administrativa detecta sessão inválida/revogada, o cookie agora é removido junto com a resposta `401`.

### F2-04 — OpenID permanente precisava circular manualmente
**Severidade:** Média-baixa  
**Status:** Corrigido

Usuários ainda não autorizados recebiam o OpenID estável para repassar ao gestor.

**Correção:** foi criado um código temporário de vinculação:
- aleatório;
- 96 bits de entropia;
- validade de 15 minutos;
- armazenado apenas como SHA-256;
- ligado a OpenID + e-mail;
- uso único;
- consumido somente pelo endpoint administrativo;
- OpenID completo não precisa circular fora do backend.

### F2-05 — Cookie de sessão estava em SameSite=Lax
**Severidade:** Baixa  
**Status:** Corrigido

A sessão administrativa passou para `SameSite=Strict`.

O cookie transitório de OAuth permanece `Lax`, pois precisa retornar do provedor externo.

### F2-06 — Parâmetros OAuth poderiam aparecer em Referer
**Severidade:** Baixa  
**Status:** Corrigido

Login e callback OAuth agora respondem com `Referrer-Policy: no-referrer`, reduzindo risco de vazamento de `code`/`state`.

## Proteções confirmadas

- token adulterado é rejeitado;
- token expirado é rejeitado;
- rotação do secret invalida tokens antigos;
- role não é embutido no JWT;
- e-mail não concede acesso sozinho;
- OpenID precisa corresponder ao vínculo autorizado;
- alteração/removal de membro revoga sessões existentes;
- bootstrap manager é definido por OpenID e protegido;
- `state` usa comparação resistente a timing;
- challenge OAuth é de uso único;
- redirect URI do challenge é validado;
- cookies administrativos são HttpOnly, Secure em produção e host-only.

## Risco residual conhecido

PKCE não foi adicionado porque o provedor OAuth atual precisa suportar explicitamente `code_challenge`/`code_verifier`. Não será implementado sem confirmar o contrato do provedor.

## Gate da Fase 2

A fase é considerada **PASS** quando:

- JWT válido/adulterado/expirado estiver coberto por testes;
- state OAuth estiver coberto por testes;
- cookies de produção estiverem cobertos;
- logout local for fail-safe;
- alteração de acesso invalidar sessão existente;
- código temporário substituir exposição de OpenID;
- CI e CodeQL estiverem verdes.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

Objetivos:
- provar que Editor não consegue executar nenhuma ação de Gestor;
- testar IDOR e manipulação de IDs;
- validar capacidades por rota;
- impedir autoelevação;
- impedir edição de recursos fora do escopo permitido.
