# Camada 1 — Fase 2: Autenticação e sessão

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que autenticação administrativa, emissão de sessão, revogação, logout e retorno OAuth sejam resistentes a replay, token roubado, configuração incompleta e mudanças de permissão.

## Modelo atual

- OAuth externo inicia o login.
- O backend gera um `state` aleatório de 256 bits.
- Apenas o hash SHA-256 do state é persistido.
- O challenge é consumido atomicamente e só pode ser usado uma vez.
- O JWT administrativo contém apenas `sub`, `jti`, issuer, audience, iat e exp.
- Cada `jti` emitido também é persistido no banco.
- Toda requisição administrativa revalida:
  - assinatura/idade do JWT;
  - sessão server-side ativa;
  - identidade OAuth atual;
  - e-mail atual;
  - acesso ativo;
  - papel atual.
- Logout revoga a sessão no banco antes de responder.
- Mudanças de acesso da equipe revogam todas as sessões do usuário alterado.

## Achados e correções

### F2-01 — Logout apagava apenas o cookie
**Severidade:** Alta  
**Status:** Corrigido

Antes, o JWT continuaria criptograficamente válido após logout até expirar.

**Correção:** nova tabela `morada_admin_sessions`, com `jti`, identidade, e-mail, expiração e revogação. Logout revoga o `jti` server-side.

---

### F2-02 — OAuth state não tinha consumo server-side de uso único
**Severidade:** Alta  
**Status:** Corrigido

O state era comparado com cookie, mas não existia registro atômico para impedir replay concorrente.

**Correção:** nova tabela `morada_auth_challenges`. O state:
- é gerado com 32 bytes aleatórios;
- é armazenado apenas como hash SHA-256;
- expira em 10 minutos;
- é bloqueado em transação e removido no primeiro uso;
- falha em qualquer tentativa posterior.

---

### F2-03 — JWT carregava dados desnecessários
**Severidade:** Média  
**Status:** Corrigido

O token continha e-mail, nome e papel.

**Correção:** JWT agora contém somente identificadores técnicos. E-mail, nome e papel vêm do banco em cada requisição.

---

### F2-04 — Sessão tinha duração de 12 horas sem idade máxima adicional
**Severidade:** Média  
**Status:** Corrigido

**Correção:** duração absoluta reduzida para 8 horas e verificação usa `maxTokenAge: 8h`, além do `exp`.

---

### F2-05 — OAuth state usava cookie `__Secure-`
**Severidade:** Média-baixa  
**Status:** Corrigido

**Correção:** em produção, state e sessão usam prefixo `__Host-`, sem Domain e com Path=/, Secure, HttpOnly e SameSite=Lax.

---

### F2-06 — Reautenticação não invalidava a sessão anterior do navegador
**Severidade:** Média  
**Status:** Corrigido

**Correção:** ao concluir novo login, o `jti` anterior presente no navegador é revogado antes da emissão da nova sessão.

---

### F2-07 — Mudança de papel/acesso não encerrava sessões já emitidas
**Severidade:** Alta  
**Status:** Corrigido

**Correção:** alteração ou remoção de membro da equipe chama `revokeAdminSessionsByEmail`. O usuário precisa autenticar novamente.

Gestores bootstrap removidos da configuração de ambiente também têm sessões revogadas durante a reconciliação da migração.

---

### F2-08 — Produção podia iniciar antes de validar toda configuração de autenticação
**Severidade:** Alta  
**Status:** Corrigido

Produção agora falha antes de aceitar tráfego se faltar:
- banco configurado;
- secret de sessão forte;
- `ADMIN_ORIGIN` HTTPS;
- URLs OAuth válidas e HTTPS;
- project id.

URLs OAuth com credenciais embutidas também são rejeitadas.

---

### F2-09 — Callback OAuth aceitava parâmetros sem limites explícitos
**Severidade:** Média-baixa  
**Status:** Corrigido

**Correção:**
- state precisa ter exatamente o tamanho do token esperado;
- código OAuth tem limite;
- e-mail e OpenID respeitam os tamanhos persistidos;
- e-mail inválido é rejeitado;
- e-mail explicitamente informado como não verificado pelo provider é rejeitado;
- respostas do callback usam `no-store`.

---

### F2-10 — Múltiplas identidades OAuth podiam permanecer associadas ao mesmo e-mail
**Severidade:** Média  
**Status:** Corrigido

**Correção:** ao atualizar a identidade administrativa, registros antigos daquele e-mail com outro OpenID são removidos transacionalmente. Sessões antigas deixam de encontrar uma identidade válida.

---

### F2-11 — Audiência legada do token ainda era aceita pelas sessões antigas
**Severidade:** Média-baixa  
**Status:** Corrigido

A audience foi alterada para `gisley-admin`. Tokens anteriores com `morada-admin` deixam de validar.

## Testes adicionados

A suíte cobre:

- JWT válido;
- payload mínimo;
- JWT adulterado;
- JWT expirado;
- JWT com idade absoluta superior a 8 horas;
- JWT com audience antiga;
- hash do OAuth state;
- comparação segura do state;
- produção sem banco;
- produção com ADMIN_ORIGIN HTTP;
- OAuth HTTP em produção;
- secret placeholder/fraco;
- URL OAuth com usuário/senha embutidos;
- logout cross-site bloqueado;
- logout same-origin idempotente;
- todas as rotas administrativas anônimas continuam bloqueadas.

## Propriedades de segurança resultantes

### Token roubado após logout
**Resultado:** rejeitado porque o `jti` foi revogado.

### Usuário removido da equipe
**Resultado:** sessões são revogadas imediatamente e o acesso é revalidado no banco.

### Papel Editor → Gestor ou Gestor → Editor
**Resultado:** sessões existentes são revogadas; novo login recebe contexto atualizado.

### OAuth callback repetido
**Resultado:** o challenge já foi consumido e a segunda tentativa falha.

### State OAuth adulterado
**Resultado:** falha na comparação constante e/ou não encontra challenge válido.

### JWT adulterado
**Resultado:** assinatura inválida.

### JWT antigo com audience anterior
**Resultado:** rejeitado.

### Banco indisponível
**Resultado:** sessão administrativa não é considerada válida; produção também usa readiness/fail-closed.

## Itens deliberadamente deixados para Camada 2

Não são blockers da Camada 1, mas podem ser adicionados depois:

- MFA/2FA;
- rotação de chaves com `kid`;
- secret rotation com período de transição;
- painel de “sessões ativas” por usuário;
- revogação manual de todos os dispositivos;
- idle timeout separado do timeout absoluto;
- autenticação adaptativa por risco;
- WebAuthn/passkeys;
- detecção de login anômalo.

## Gate da Fase 2

A fase só é PASS se:

- state OAuth for aleatório, expirável e de uso único;
- sessão puder ser revogada server-side;
- logout revogar a sessão;
- alteração de acesso revogar sessões;
- JWT não carregar papel ou dados pessoais desnecessários;
- JWT adulterado/expirado/antigo for rejeitado;
- produção falhar fechada com configuração inválida;
- cookies administrativos forem host-only/secure em produção;
- CI, Docker e CodeQL permanecerem verdes.

## Próxima fase

**Fase 3 — Autorização e privilégio mínimo**

A próxima fase deverá validar IDOR, ações Editor vs Gestor, manipulação direta de IDs/payloads, tentativa de autopromoção, ações cruzadas entre entidades e enforcement exclusivamente no backend.
