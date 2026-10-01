# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que o painel administrativo dependa de identidade autenticada, sessão verificável e revogável, sem confiar em papel, e-mail ou permissões vindos do navegador.

## Controles validados

### OAuth
- `state` aleatório de 32 bytes;
- cookie `HttpOnly`;
- challenge armazenado no banco apenas como SHA-256;
- challenge consumido uma única vez;
- challenge possui expiração de 10 minutos;
- callback exige igualdade timing-safe entre query e cookie;
- redirect URI é salvo no challenge e comparado antes da troca do código;
- código OAuth tem limite de tamanho;
- access token do provedor não é persistido no banco nem no navegador;
- identidade recebida do provedor é validada antes de criar sessão;
- `emailVerified=false` é rejeitado quando o provider informa explicitamente esse estado.

### Sessão administrativa
- JWT HS256 com algoritmo fixado na verificação;
- `typ=JWT` obrigatório;
- issuer `gisley-nunes-imoveis`;
- audience `gisley-admin`;
- `sub` contém apenas o identificador técnico da identidade;
- `jti` único por sessão;
- JWT não contém e-mail, nome ou papel;
- expiração absoluta de 8 horas;
- `maxTokenAge=8h`;
- tolerância de relógio limitada a 30 segundos;
- sessão também precisa existir ativa no banco;
- sessão revogada/expirada é rejeitada;
- papel é recalculado a partir do banco/configuração a cada request;
- remoção/desativação de usuário invalida acesso;
- mudança de equipe revoga sessões persistidas;
- secret rotacionado invalida tokens antigos;
- produção exige secret forte e configuração completa.

## Cookies

Em produção:

- sessão: `__Host-gisley_admin_session`;
- state OAuth: `__Host-gisley_oauth_state`;
- `HttpOnly`;
- `Secure`;
- `SameSite=Lax`;
- `Path=/`;
- sem atributo `Domain`;
- prioridade alta.

O prefixo `__Host-` impede compartilhamento do cookie com outros subdomínios e exige cookie Secure com Path raiz.

## Achados

### F2-01 — Sessões ligadas a identidade OAuth anterior podiam permanecer no banco
**Severidade:** Média  
**Status:** Corrigido

Ao atualizar a identidade administrativa, uma sessão antiga associada ao mesmo e-mail com outro OpenID — ou ao mesmo OpenID com outro e-mail — só seria invalidada quando utilizada e revalidada.

**Correção:** `upsertAdmin` agora revoga, dentro da mesma transação, sessões ativas ligadas às combinações de identidade substituídas antes de atualizar o usuário.

### F2-02 — Quantidade ilimitada de sessões administrativas simultâneas
**Severidade:** Média-baixa  
**Status:** Corrigido

Cada novo login criava um novo JTI válido por até oito horas, sem limite de sessões simultâneas.

**Correção:** limite configurável por `GISELY_MAX_ADMIN_SESSIONS`, padrão 5, mínimo 1 e máximo 10.

A criação de sessão:
1. serializa por usuário através da linha de acesso da equipe;
2. cria a nova sessão;
3. preserva explicitamente a sessão recém-criada;
4. mantém somente as sessões anteriores mais recentes permitidas;
5. revoga as excedentes.

### F2-03 — Secret longo, porém previsível, era aceito
**Severidade:** Média  
**Status:** Corrigido

O requisito anterior verificava principalmente comprimento e placeholders conhecidos. Uma sequência repetitiva com 64 caracteres poderia passar.

**Correção:** secrets de baixa diversidade e padrões repetitivos são rejeitados, além dos controles de comprimento e placeholders.

### F2-04 — Configuração de gestor bootstrap não validava formato
**Severidade:** Baixa  
**Status:** Corrigido

Produção exigia pelo menos um valor em `GISELY_ADMIN_EMAILS`, mas não validava se os valores eram e-mails utilizáveis.

**Correção:** produção falha fechada com `BOOTSTRAP_MANAGER_INVALID` quando qualquer gestor bootstrap tiver formato inválido ou comprimento excessivo.

### F2-05 — Mudança de papel/acesso precisava invalidar sessões persistidas
**Severidade:** Média se ausente  
**Resultado:** Controle já presente no HEAD atual

`PATCH` e `DELETE` de membros da equipe chamam `revokeAdminSessionsByEmail`. A sessão deixa de ser apenas “logicamente bloqueada” e passa a ficar explicitamente revogada no banco.

### F2-06 — Replay de OAuth state
**Severidade:** Crítica se existente  
**Resultado:** Não encontrado

O challenge é bloqueado com `FOR UPDATE`, removido na mesma transação e não pode ser consumido novamente.

### F2-07 — Session fixation
**Severidade:** Alta se existente  
**Resultado:** Não encontrado

Um login concluído sempre cria novo JTI. Quando o cookie de sessão anterior chega ao callback, sua sessão é revogada antes da emissão da nova.

### F2-08 — Papel/role armazenado no JWT
**Severidade:** Alta se existente  
**Resultado:** Não encontrado

O token não contém papel. O papel efetivo é resolvido no servidor a partir de `GISELY_ADMIN_EMAILS` e `morada_staff_access` em cada request.

## Decisão de compatibilidade — emailVerified

A implementação rejeita explicitamente `emailVerified=false`.

Não foi alterada para exigir estritamente `emailVerified===true`, porque o endpoint WebDevAuth utilizado atualmente não possui contrato público suficiente garantindo a presença desse campo em todas as respostas. Exigir o campo sem confirmação poderia derrubar todo o login legítimo.

Essa decisão deve ser revisitada se o provedor formalizar o campo no contrato da API ou quando a autenticação for migrada para o OAuth2 público documentado.

## Testes adversariais

A suíte cobre:

- token válido;
- token adulterado;
- token expirado;
- token com idade absoluta acima de oito horas;
- audiência incorreta;
- issuer incorreto;
- `typ` incorreto;
- secret rotacionado;
- ausência de dados pessoais/papel dentro do JWT;
- hash de state;
- comparação timing-safe;
- secret fraco;
- origem administrativa HTTP em produção;
- OAuth HTTP em produção;
- banco ausente;
- gestor bootstrap ausente;
- gestor bootstrap inválido;
- limite configurável de sessões.

## Gate da Fase 2

A fase é **PASS** somente quando:

- JWT adulterado/expirado é rejeitado;
- issuer/audience/algoritmo/typ são estritos;
- state OAuth é one-time e timing-safe;
- produção exige banco, OAuth, origem HTTPS, gestor e secret forte;
- sessão depende simultaneamente do JWT e do registro server-side;
- papel é sempre resolvido no backend;
- alteração/remoção de acesso revoga sessões;
- troca de identidade revoga sessões antigas;
- sessões simultâneas são limitadas;
- CI está verde;
- CodeQL está verde.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

Próximos testes:
- Editor tentando executar ações de Gestor;
- promoção indevida de papel via payload;
- autoelevação;
- alteração/removal do próprio acesso;
- proteção dos gestores bootstrap;
- IDOR em imóvel, foto, lead e membro da equipe;
- autorização aplicada sempre no backend, independentemente do frontend.
