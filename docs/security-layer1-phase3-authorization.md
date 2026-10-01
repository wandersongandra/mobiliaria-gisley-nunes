# Camada 1 — Fase 3: Autorização e privilégio mínimo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que autenticação válida não seja suficiente por si só: cada ação sensível deve exigir capacidade explícita, respeitar o estado do recurso e permanecer segura mesmo sob concorrência.

## Modelo de capacidades

### Editor
- `property.read`
- `property.write`
- `media.manage`
- `site.read`
- `lead.read`
- `lead.status`

Editor não possui:
- `property.publish`
- `property.archive`
- `site.manage`
- `testimonial.manage`
- `lead.erase`
- `audit.read`
- `team.manage`

### Gestor
Possui todas as capacidades operacionais do Editor mais:
- publicação;
- arquivamento;
- dados institucionais;
- depoimentos;
- exclusão de dados pessoais de leads;
- auditoria;
- gestão de equipe.

## Regras de recurso

- Editor cria apenas rascunho não destacado.
- Editor edita somente imóvel que continue `draft`.
- Editor gerencia mídia somente de imóvel que continue `draft`.
- Gestor pode publicar, destacar, editar publicado/arquivado e arquivar.
- Exclusão LGPD, equipe e auditoria permanecem exclusivas de Gestor.
- Papel desconhecido falha fechado e recebe zero capacidades.

## Achados e correções

### F3-01 — Janela TOCTOU entre autorização HTTP e gravação
**Severidade:** Média  
**Status:** Corrigido

A rota verificava o estado do imóvel antes da operação. Em uma corrida, um Editor poderia receber autorização enquanto o imóvel era rascunho, um Gestor publicá-lo logo depois, e a gravação do Editor chegar ao banco após a publicação.

**Correção:** a autorização de estado passou a ser revalidada dentro da própria transação com lock da linha.

As seguintes operações agora aceitam `requireDraft` e falham com `CAPABILITY_REQUIRED` se o estado mudar antes da gravação:
- atualização de imóvel;
- inclusão de foto;
- remoção de foto;
- definição de capa;
- reordenação da galeria.

Assim, a autorização permanece válida no mesmo instante lógico da mutação.

### F3-02 — Payload administrativo entregava metadados internos de storage
**Severidade:** Baixa-média  
**Status:** Corrigido

A API do CRM retornava campos que o frontend não utiliza:
- `storage_path`;
- `storage_provider`;
- `uploaded_by`;
- MIME;
- tamanho;
- largura/altura;
- `property_id` interno da foto.

**Correção:** criado presenter administrativo explícito. O navegador recebe apenas os campos necessários para operação do CRM.

### F3-03 — API de auditoria entregava detalhes internos do evento
**Severidade:** Baixa-média  
**Status:** Corrigido

O banco preserva `details` para investigação, mas alguns eventos podem conter informações como caminho interno de storage. O frontend de Atividade não usa esse conteúdo.

**Correção:** `auditView` remove `details` e o OpenID bruto. O CRM recebe somente identificação minimizada, ação, entidade, ID e horário.

### F3-04 — Escalada de Editor por payload
**Severidade:** Alta se existente  
**Resultado:** Bloqueada e coberta por testes

Foram testadas tentativas de:
- criar imóvel com `status=published`;
- criar imóvel `featured=true`;
- editar imóvel já publicado;
- iniciar upload de mídia em imóvel publicado;
- arquivar imóvel;
- utilizar valor textual enganoso para `featured`.

Todas falham antes da lógica sensível.

### F3-05 — IDOR de mídia
**Severidade:** Alta se existente  
**Resultado:** Não identificado

Controles confirmados:
- exclusão/capa resolvem a foto pelo ID e depois o imóvel associado;
- autorização usa o estado do imóvel real associado à foto;
- `storagePath` precisa pertencer ao `propertyId` da rota;
- reordenação aceita somente o conjunto exato de IDs de fotos pertencentes ao imóvel;
- IDs externos não são silenciosamente incorporados.

### F3-06 — Escalada de papel e gestão de equipe
**Severidade:** Alta se existente  
**Resultado:** Bloqueada

- Editor não possui `team.manage`;
- usuário não pode remover a própria conta;
- usuário não pode reduzir o próprio papel;
- gestor bootstrap não pode ser desativado/rebaixado pelo CRM;
- alterações de acesso revogam sessões anteriores.

## Minimização

- OpenID bruto não é retornado na lista de equipe; apenas hint.
- OpenID bruto do autor não é retornado na trilha de auditoria.
- Metadados internos de storage permanecem somente no backend/banco.
- API pública continua usando presenter ainda mais restrito.

## Testes adversariais adicionados

- matriz exata de capacidades do Editor;
- matriz administrativa do Gestor;
- papel desconhecido fail-closed;
- rotas exclusivas do Gestor retornam 403 para Editor;
- método HTTP inesperado não contorna guard;
- payload de publicação/destaque por Editor;
- edição direta de imóvel publicado;
- presign de mídia em imóvel publicado;
- arquivamento por Editor;
- minimização de equipe/auditoria;
- minimização de propriedades/fotos administrativas.

## Gate da Fase 3

Requisitos:
- capability explícita em toda rota sensível;
- Editor não publica/arquiva;
- estado do recurso revalidado transacionalmente;
- IDOR de foto/imóvel bloqueado;
- payload administrativo minimizado;
- papel desconhecido fail-closed;
- CI: PASS;
- CodeQL: PASS.

## Próxima fase

**Fase 4 — Origem, CSRF e domínio administrativo**

A próxima etapa revisará:
- `Origin`;
- `Sec-Fetch-Site`;
- Host;
- subdomínios público/painel;
- spoof de proxy;
- métodos mutáveis;
- login/callback;
- requisições cross-site;
- comportamento atrás do Cloudflare.
