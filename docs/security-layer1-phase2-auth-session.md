# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch: `audit/security-design-2026-09-30`

## Escopo

Revisão do fluxo OAuth, state/nonce, identidade, cookies, JWT, sessões server-side, expiração, inatividade, revogação, troca de papel, remoção de usuário e vínculo de novos membros.

## Controles existentes validados

- OAuth state aleatório com 32 bytes e armazenamento apenas do hash no banco.
- State também mantido em cookie HttpOnly.
- Challenge OAuth consumível uma única vez.
- Redirect URI persistida no challenge e revalidada no callback.
- Sessão JWT com HS256, issuer, audience, subject, JTI, iat e exp.
- Validade absoluta máxima de 8 horas.
- Sessão também precisa existir e estar ativa no banco.
- Idle timeout server-side configurável.
- Limite de sessões concorrentes por OpenID.
- Cookie administrativo host-only em produção com prefixo `__Host-`.
- Cookie HttpOnly, Secure em produção, SameSite Strict para sessão.
- Cookie de state OAuth SameSite Lax apenas para permitir retorno top-level.
- Papel não é confiado ao JWT: é recalculado no banco.
- Alteração/remoção de membro revoga sessões existentes.
- Logout individual revoga JTI server-side.
- Logout-all revoga todas as sessões do OpenID.
- Bootstrap de gestor é feito por OpenID e não por e-mail.

## Achados

### F2-01 — Pairing code era consumido antes de confirmar vínculo
**Severidade:** Média-baixa  
**Status:** Corrigido

Em conflito de e-mail/OpenID, o código de pairing podia ser consumido antes de a criação do membro falhar.

**Correção:** criação do acesso + validação de conflitos + consumo do código agora ocorrem na mesma transação.

### F2-02 — Validação OAuth de OpenID inconsistente
**Severidade:** Baixa  
**Status:** Corrigido

O callback limitava tamanho, mas podia aceitar OpenID com espaço ou caractere de controle; o JWT rejeitaria depois, criando estado impossível de usar.

**Correção:** normalização única de identidade OAuth. OpenID inválido é recusado antes de persistência/sessão.

### F2-03 — E-mail explicitamente não verificado pelo provedor
**Severidade:** Média-baixa  
**Status:** Corrigido

Quando o provedor expõe `emailVerified/email_verified=false`, o acesso agora é recusado.

### F2-04 — Regras de vínculo sessão ↔ JWT ↔ usuário espalhadas
**Severidade:** Baixa  
**Status:** Corrigido

A validação foi centralizada em `resolveSessionIdentity()`, cobrindo:
- JTI da sessão igual ao JTI do token;
- OpenID da sessão igual ao subject do token;
- OpenID do usuário igual ao subject;
- e-mail atual igual ao e-mail da sessão;
- acesso ativo e vinculado ao mesmo OpenID;
- papel recalculado no banco.

### F2-05 — Estado de expiração server-side sem contrato puro testável
**Severidade:** Baixa  
**Status:** Corrigido

Criada `adminSessionState()` para classificar:
- missing;
- revoked;
- absolute_expired;
- idle_expired;
- active.

### F2-06 — Default de sessões simultâneas excessivo para o porte atual
**Severidade:** Baixa  
**Status:** Corrigido

Default reduzido de 5 para 3 sessões concorrentes por identidade, mantendo faixa configurável de 1 a 10.

### F2-07 — Secret scan sem localização dos achados
**Severidade:** Operacional  
**Status:** Corrigido

O scanner agora reporta arquivo/linha no HEAD e commit/arquivo no histórico, sem revelar o valor.

## Testes adversariais adicionados

- JWT íntegro vs adulterado.
- JWT expirado.
- issuer incorreto.
- audience incorreta.
- typ incorreto.
- iat futuro.
- janela de expiração excessiva.
- segredo fraco.
- OpenID vazio, com espaço ou controle.
- e-mail OAuth inválido.
- e-mail explicitamente não verificado.
- JTI diferente entre JWT e sessão.
- sessão de outro OpenID.
- e-mail da sessão divergente do usuário atual.
- acesso desativado.
- acesso vinculado a outro OpenID.
- sessão revogada.
- sessão expirada.
- sessão ociosa.
- cookies `__Host-` em produção.
- flags Secure/HttpOnly/SameSite.
- state OAuth comparado em tempo constante.

## Critério de PASS

- JWT válido isoladamente não autentica sem sessão server-side ativa.
- sessão revogada/expirada/ociosa é recusada.
- mudança de papel é refletida pelo banco, não pelo token.
- remoção/rebaixamento revoga sessões.
- OAuth state não pode ser reutilizado.
- pairing não pode ser reutilizado nem vinculado a outro e-mail.
- cookie de sessão permanece host-only e inacessível ao JavaScript.
- segredo fraco impede emissão de sessão.
- CI, secret scan e CodeQL verdes.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

Foco: capabilities Editor/Gestor, IDOR, manipulação de IDs, publicação/arquivamento, mídia, equipe, leads, dados do site e tentativas de elevação de privilégio.
