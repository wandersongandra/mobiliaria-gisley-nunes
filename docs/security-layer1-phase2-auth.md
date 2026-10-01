# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que a identidade administrativa seja forte, que sessões possam ser revogadas imediatamente e que OAuth/JWT/cookies não dependam de dados de identidade fracos ou persistam além do necessário.

## Modelo final de identidade

A autorização administrativa é vinculada ao **`openId` retornado pelo provedor OAuth**.

O e-mail:

- continua sendo armazenado para contato e identificação visual;
- não concede acesso;
- não promove papel;
- não é usado para validar sessão;
- não é usado para revogar sessão.

### Bootstrap

Gestores principais são definidos por:

```env
GISELY_ADMIN_OPEN_IDS=open-id-do-gestor
```

Em produção, a aplicação falha fechada se nenhum `openId` bootstrap estiver configurado.

### Inclusão de equipe

1. A pessoa tenta entrar pelo OAuth.
2. Se ainda não estiver autorizada, o callback mostra apenas o próprio Código de identidade OAuth.
3. A pessoa envia esse código ao Gestor.
4. O Gestor cadastra nome, e-mail de contato, `openId` e papel.
5. A partir daí o `openId` autenticado precisa coincidir com o registro ativo.

## Sessão

- JWT assinado com HS256;
- issuer fixo `gisley-nunes-imoveis`;
- audience fixa `gisley-admin`;
- `typ=JWT`;
- `sub=openId`;
- `jti` único;
- nenhum e-mail, nome ou papel dentro do JWT;
- validade absoluta máxima: 8 horas;
- idle timeout server-side: 60 minutos por padrão, configurável entre 15 e 240;
- registro de sessão no MySQL;
- papel reconsultado no banco em toda requisição administrativa;
- sessões revogadas quando acesso/papel é alterado;
- limite de sessões concorrentes configurável entre 1 e 10.

## Cookies

Produção:

- `__Host-gisley_admin_session`;
- `__Host-gisley_oauth_state`;
- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- `Path=/`;
- sem atributo `Domain`;
- prioridade alta.

`SameSite=Lax` é mantido para permitir o retorno top-level do fluxo OAuth.

## OAuth state

- 32 bytes aleatórios;
- codificação base64url;
- estado bruto fica somente no cookie host-only do navegador;
- no banco é armazenado apenas SHA-256 do state;
- challenge possui expiração de 10 minutos;
- challenge é consumido dentro de transação e removido antes da troca de código;
- replay do mesmo state não encontra mais challenge;
- comparação cookie/query usa `timingSafeEqual`;
- redirect URI armazenado no challenge é comparado novamente no callback;
- callback usa `Cache-Control: no-store`.

## Achados

### F2-01 — Autorização baseada em e-mail do OAuth
**Severidade:** Alta  
**Status:** Corrigido

O modelo anterior concedia acesso quando o e-mail retornado pelo OAuth coincidia com a lista/equipe. Como o e-mail do provider não é tratado como identidade forte verificável no nosso contrato, isso não é aceitável para autorização.

**Correção:** acesso migrado integralmente para `openId`. O e-mail virou apenas metadado.

### F2-02 — Gestor bootstrap removido do ambiente podia permanecer ativo até nova migração
**Severidade:** Alta-média  
**Status:** Corrigido

**Correção:** `currentAdmin` revalida o `openId` bootstrap em toda requisição. Um registro `invited_by=environment` deixa de conceder acesso imediatamente quando seu `openId` sai da configuração.

### F2-03 — Sessão roubada podia permanecer utilizável por até 8 horas sem atividade
**Severidade:** Média  
**Status:** Corrigido

**Correção:** idle timeout server-side de 60 minutos, sem alterar o teto absoluto de 8 horas.

### F2-04 — Cookie temporário OAuth usava prefixo `__Secure-`
**Severidade:** Baixa  
**Status:** Corrigido

**Correção:** os dois cookies administrativos usam `__Host-` em produção, impedindo `Domain` e exigindo `Secure` + `Path=/`.

### F2-05 — Logout limpava o cookie mesmo se a revogação no banco falhasse
**Severidade:** Média  
**Status:** Corrigido

Nesse cenário, o navegador perdia o token e não conseguia tentar revogar novamente, enquanto uma cópia roubada poderia voltar a funcionar quando o banco retornasse.

**Correção:** se a revogação server-side falhar, a API responde 503 e preserva o cookie para permitir retry. O cookie só é removido após revogação bem-sucedida ou quando já é inválido.

### F2-06 — Segredo de sessão aceitava alguns padrões de baixa diversidade
**Severidade:** Baixa  
**Status:** Corrigido

**Correção:** além de 32+ bytes e rejeição de placeholders conhecidos, segredos com diversidade insuficiente ou blocos curtos repetidos são recusados.

### F2-07 — Revogação por e-mail
**Severidade:** Média  
**Status:** Corrigido

**Correção:** alterações/remissões da equipe revogam sessões por `openId`, nunca por endereço de e-mail.

## Controles previamente existentes e revalidados

- JWT adulterado é rejeitado;
- JWT expirado é rejeitado;
- JWT com issuer/audience/typ incorretos é rejeitado;
- rotação do secret invalida tokens antigos;
- papel não fica congelado dentro do JWT;
- sessão precisa existir e estar ativa no banco;
- `openId` do JWT precisa coincidir com a sessão e com o usuário;
- troca de mapeamento e-mail↔openId revoga sessões antigas;
- nova autenticação gera novo `jti`;
- login e callback possuem rate limit;
- logout exige mesma origem;
- sessão administrativa nunca é exposta em cache público.

## Risco residual conhecido — PKCE

O fluxo atual do provider utilizado recebe `clientId`, `code` e `redirectUri`; não há suporte confirmado a `code_verifier/code_challenge` no contrato disponível usado pelo projeto.

Não foi adicionado PKCE de forma inventada, pois isso poderia quebrar o provider sem oferecer segurança real.

Compensações atuais:

- state aleatório de 256 bits;
- state host-only;
- hash do state no banco;
- uso único;
- expiração curta;
- redirect URI vinculado;
- callback limitado à origem administrativa;
- authorization code nunca é persistido.

Se o provider passar a documentar PKCE, ele deve ser adotado.

## Gates da Fase 2

A fase só é considerada PASS quando:

- autorização não depender de e-mail;
- bootstrap usar `openId`;
- sessão expirada/adulterada for rejeitada;
- role/access forem reavaliados server-side;
- alteração/remissão de acesso revogar sessões por `openId`;
- OAuth state for one-time;
- cookie de produção for host-only;
- idle timeout estiver ativo;
- logout falhar fechado se revogação falhar;
- CI e CodeQL estiverem verdes.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

Foco: matriz Gestor/Editor, IDOR, alteração de payload, autoelevação, acesso cruzado a entidades, métodos HTTP inesperados e confirmação de autorização exclusivamente no backend.
