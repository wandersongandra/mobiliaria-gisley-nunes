# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que a autenticação administrativa tenha identidade forte, sessão revogável, cookies seguros, proteção contra replay e revalidação contínua de autorização.

## Arquitetura validada

### OAuth
- login iniciado somente pela origem administrativa quando `ADMIN_ORIGIN` está configurado;
- `state` aleatório de 256 bits;
- somente o hash SHA-256 do `state` é persistido no banco;
- cookie de `state` é `HttpOnly`, `Secure` em produção, `SameSite=Lax` e host-only;
- callback compara cookie e query usando `timingSafeEqual`;
- desafio OAuth é consumido uma única vez dentro de transação com `FOR UPDATE`;
- desafio expirado ou reutilizado é rejeitado;
- redirect URI persistida no desafio precisa coincidir com a origem administrativa esperada.

### Sessão
- JWT assinado com HS256;
- algoritmo fixado explicitamente na verificação;
- `issuer` e `audience` obrigatórios;
- `jti` único por sessão;
- JWT não contém papel, e-mail ou capacidades;
- sessão precisa existir e estar ativa no banco;
- validade absoluta: 8 horas;
- timeout de inatividade configurável, padrão de 60 minutos;
- sessões simultâneas limitadas por OpenID;
- papel e acesso são recalculados no banco em cada requisição;
- sessão pode ser revogada individualmente ou globalmente por OpenID.

### Cookies
Em produção:
- `__Host-gisley_admin_session`;
- `__Host-gisley_oauth_state`;
- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- `Path=/`;
- sem atributo `Domain`;
- prioridade alta.

## Achados e correções

### F2-01 — Primitiva de sessão aceitava segredo apenas pelo comprimento
**Severidade:** Média-baixa  
**Status:** Corrigido

O fluxo principal já recusava segredo fraco, porém `createSessionToken()` e `verifySessionToken()` verificavam apenas tamanho mínimo quando utilizadas diretamente.

**Correção:** ambas agora usam a mesma política de segredo forte do startup/login.

### F2-02 — Sessão antiga podia voltar após remoção e reativação rápida
**Severidade:** Média  
**Status:** Corrigido

O acesso era recalculado em cada request, portanto uma conta removida deixava de funcionar imediatamente. Porém a sessão antiga permanecia não revogada no banco e poderia voltar a ser aceita se o mesmo acesso fosse recriado antes da expiração absoluta.

**Correção:** alterações de papel, desativação, remoção e reassociação de equipe revogam todas as sessões ligadas ao OpenID afetado. Reativação exige novo login.

### F2-03 — Convite administrativo dependia principalmente do OpenID
**Severidade:** Média  
**Status:** Corrigido

Para usuários comuns, o OpenID autorizado era suficiente mesmo se o e-mail retornado pelo OAuth fosse diferente do e-mail cadastrado pelo gestor.

**Correção:** contas não-bootstrap exigem dupla correspondência:
1. OpenID OAuth;
2. e-mail OAuth normalizado.

O gestor bootstrap permanece ancorado no OpenID explicitamente configurado por ambiente.

### F2-04 — Limite de sessões era aplicado pelo e-mail
**Severidade:** Baixa-média  
**Status:** Corrigido

E-mail é atributo mutável; a identidade canônica é o OpenID.

**Correção:** o limite de sessões simultâneas e o lock de concorrência passaram a usar OpenID.

### F2-05 — Relação OpenID/e-mail administrativo não possuía constraint completa
**Severidade:** Média  
**Status:** Corrigido

`morada_admin_users` tinha OpenID como chave primária, mas e-mail não era UNIQUE. A lógica da aplicação tentava garantir relação 1:1, mas dois logins concorrentes ainda poderiam disputar a mesma identidade de e-mail.

**Correção:** adicionada constraint `UNIQUE uq_morada_admin_email (email)`. Dados duplicados existentes fazem a migração falhar fechada em vez de serem mesclados por heurística.

### F2-06 — Frontend simulava logout mesmo quando a revogação falhava
**Severidade:** Média  
**Status:** Corrigido

O painel escondia o dashboard logo após o clique em “Sair”, sem verificar se o backend conseguiu revogar a sessão.

**Correção:** a interface só volta ao login após resposta `ok: true`. Em erro de revogação, mantém o estado visível e informa que não foi possível confirmar o logout.

### F2-07 — Dados administrativos permaneciam na memória da página após expiração/logout
**Severidade:** Baixa-média  
**Status:** Corrigido

Imóveis, leads, equipe e auditoria continuavam no objeto de estado JavaScript após a interface voltar para o login.

**Correção:** `clearSensitiveState()` apaga dados administrativos, fecha editor e limpa listas antes de exibir a tela de autenticação.

### F2-08 — Ausência de revogação global pelo próprio usuário
**Severidade:** Hardening  
**Status:** Implementado

Adicionado `POST /api/auth/logout-all`, protegido por:
- origem administrativa;
- same-origin;
- sessão autenticada.

O painel recebeu a ação “Encerrar em todos os dispositivos”.

## Testes adicionados

A suíte cobre agora:

- JWT válido;
- JWT adulterado;
- JWT expirado;
- rotação de segredo;
- ausência de papel/e-mail no JWT;
- hash e comparação do OAuth state;
- vínculo OpenID incorreto;
- e-mail OAuth divergente do convite;
- acesso inativo;
- bootstrap manager;
- cookies `__Host-` e flags fortes em produção;
- configuração de produção válida;
- segredo fraco;
- OAuth HTTP em produção;
- ausência de `ADMIN_ORIGIN`;
- ausência/invalidade de OpenID bootstrap;
- logout global sem sessão;
- capacidades mínimas de Editor.

## Controles já existentes confirmados

- `PUBLIC_ORIGIN` e `ADMIN_ORIGIN` precisam ser HTTPS em produção;
- hosts público e administrativo precisam ser diferentes;
- Host desconhecido recebe `421 MISDIRECTED_REQUEST`;
- headers de proxy só são confiados quando explicitamente configurados;
- token adulterado não é aceito;
- sessão revogada no banco não é aceita mesmo com JWT criptograficamente válido;
- mudança de e-mail/OpenID do provedor revoga sessões conflitantes;
- callback não persiste access token OAuth.

## Riscos residuais deliberadamente fora da Camada 1/Fase 2

- MFA/2FA adicional ao OAuth;
- device binding;
- painel detalhado de sessões por dispositivo;
- detecção comportamental de login;
- alertas de novo dispositivo/localidade.

Esses controles pertencem ao hardening avançado/Camada 2 e não são necessários para o gate inicial.

## Gate da Fase 2

Requisitos:

- JWT adulterado/expirado: bloqueado;
- sessão ausente/revogada: bloqueada;
- state OAuth reutilizado/expirado: bloqueado;
- redirect URI divergente: bloqueada;
- usuário inativo: bloqueado;
- e-mail/OpenID divergentes: bloqueados;
- alteração de privilégio: sessões anteriores revogadas;
- cookies de produção: fortes;
- configuração fraca: fail-closed;
- CI: PASS;
- CodeQL: aguardando confirmação final desta revisão no momento da escrita.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

Objetivos:
- revisar capacidade por ação;
- testar Editor tentando agir como Gestor;
- testar IDOR em imóvel/foto/lead/equipe;
- validar ownership e estado do imóvel;
- impedir escalada via payload;
- garantir que o frontend nunca seja a única barreira de autorização.
