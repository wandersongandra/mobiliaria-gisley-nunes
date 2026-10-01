# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que o painel administrativo use autenticação revogável e que uma sessão só permaneça válida quando:

- o JWT for íntegro;
- issuer/audience/typ forem corretos;
- a janela temporal estiver válida;
- o JTI existir como sessão ativa no banco;
- a identidade OAuth continuar vinculada a um usuário autorizado;
- o e-mail atual continuar coerente com a identidade cadastrada;
- a sessão não estiver expirada por tempo absoluto ou inatividade.

## Arquitetura atual

A autenticação administrativa usa duas camadas simultâneas:

1. **JWT assinado HS256**
   - issuer: `gisley-nunes-imoveis`;
   - audience: `gisley-admin`;
   - subject: OpenID;
   - JTI UUID;
   - validade absoluta máxima de 8 horas.

2. **Sessão server-side no MySQL**
   - JTI;
   - OpenID;
   - e-mail;
   - expiração absoluta;
   - último uso;
   - revogação explícita.

O JWT sozinho não concede acesso: a sessão precisa continuar ativa no banco.

## OAuth

O login cria um `state` aleatório de 32 bytes, armazena apenas seu hash no banco e mantém o valor original em cookie `HttpOnly`.

O callback exige simultaneamente:

- `code` válido;
- state de tamanho esperado;
- state do callback igual ao cookie com comparação timing-safe;
- challenge existente e não expirado no banco;
- challenge de uso único;
- redirect URI exatamente igual à origem administrativa configurada.

## Cookies

### Sessão
- `HttpOnly`;
- `Secure` em produção;
- `SameSite=Strict`;
- `Path=/`;
- prioridade alta;
- prefixo `__Host-` em produção.

### OAuth state
- `HttpOnly`;
- `Secure` em produção;
- `SameSite=Lax` para permitir retorno top-level do provedor OAuth;
- `Path=/`;
- prefixo `__Host-` em produção.

## Identidade e pairing

Usuários não autorizados que concluam OAuth não recebem sessão.

Eles recebem apenas um código de vinculação temporário:

- 96 bits aleatórios;
- armazenado somente como hash;
- validade de 15 minutos;
- uso único;
- vinculado simultaneamente a OpenID e e-mail.

O gestor precisa fornecer o mesmo e-mail e o código correto para concluir o vínculo.

## Sessões simultâneas

`GISELY_MAX_ADMIN_SESSIONS` controla sessões ativas por identidade:

- mínimo: 1;
- padrão: 5;
- máximo: 10.

Ao criar uma nova sessão, as sessões excedentes mais antigas são revogadas.

## Timeout por inatividade

`GISELY_ADMIN_IDLE_TIMEOUT_MINUTES`:

- mínimo: 15 min;
- padrão: 60 min;
- máximo: 240 min.

Sessões que excedem o timeout de inatividade agora são marcadas explicitamente como revogadas no banco.

## Revogação

A sessão é invalidada quando:

- o usuário faz logout;
- usa `logout-all`;
- a sessão expira;
- excede o tempo ocioso;
- o e-mail da identidade muda de forma incompatível;
- o vínculo de equipe deixa de existir;
- o usuário é desativado;
- o papel/permissão é alterado;
- o usuário é removido da equipe.

Alterações de equipe revogam todas as sessões daquela identidade.

## Achados da Fase 2

### F2-01 — Sessão ociosa era rejeitada, mas permanecia marcada como ativa no banco
**Severidade:** Baixa  
**Status:** Corrigido

O sistema já recusava sessão fora do cutoff de inatividade, porém o registro não era atualizado como revogado.

**Correção:** sessão expirada por tempo absoluto ou inatividade passa a receber `revoked_at`.

### F2-02 — Criação de sessão não falhava explicitamente quando a identidade não estava vinculada
**Severidade:** Média-baixa  
**Status:** Corrigido

`createAdminSession()` tentava bloquear a linha de `staff_access`, mas não verificava se ela realmente existia e estava ativa.

**Correção:** criação de sessão agora falha com `SESSION_IDENTITY_NOT_BOUND` se não houver identidade ativa vinculada.

### F2-03 — Cobertura criptográfica incompleta
**Severidade:** Baixa  
**Status:** Corrigido

Já existiam testes de assinatura e expiração, mas faltava cobertura explícita para issuer, audience, typ e janelas temporais inválidas.

**Correção:** novos testes adversariais de JWT foram adicionados.

### F2-04 — Controles operacionais de sessão pouco documentados
**Severidade:** Informativa  
**Status:** Corrigido

Timeout ocioso e limite de sessões já existiam, mas agora estão explicitamente documentados e cobertos por testes de limites.

## Controles que passaram sem alteração

- assinatura adulterada é rejeitada;
- token expirado é rejeitado;
- token grande/malformado é rejeitado antes da verificação criptográfica;
- segredo fraco não emite sessão;
- JWT não confia em papel/e-mail vindos do token;
- acesso é revalidado pelo banco em cada request administrativo;
- mudança de papel revoga sessões;
- remoção de usuário revoga sessões;
- bootstrap manager é identificado por OpenID, não por e-mail;
- callback em domínio público é bloqueado;
- state OAuth é de uso único;
- pairing é de uso único;
- logout limpa o cookie local mesmo quando não existe sessão;
- logout-all exige sessão autenticada e mesma origem.

## Gate da Fase 2

A fase é **PASS** somente se:

- JWT adulterado, expirado, com issuer/audience/typ incorretos for rejeitado;
- segredo fraco não gerar token;
- state OAuth for aleatório, timing-safe e de uso único;
- callback aceitar somente redirect URI administrativa;
- sessão exigir JTI ativo no banco;
- identidade precisar estar vinculada e ativa;
- role/e-mail forem revalidados server-side;
- timeout ocioso e expiração absoluta revogarem sessão;
- mudanças de equipe revogarem sessões existentes;
- cookies mantiverem flags e prefixos esperados;
- CI e CodeQL estiverem verdes.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

A próxima revisão vai testar capability por capability, IDOR, elevação de Editor para Gestor, ações em recursos de terceiros, mutação de payload e proteção contra autoelevação/remoção de gestores protegidos.
