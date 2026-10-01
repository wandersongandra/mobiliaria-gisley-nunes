# Camada 1 — Fase 3: Autorização e privilégio mínimo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que autenticação válida não seja suficiente por si só: cada papel deve possuir somente as capacidades previstas e cada mutação sensível deve ser verificada tanto na rota quanto, quando aplicável, na persistência.

## Modelo de acesso

O CRM usa um workspace compartilhado da imobiliária.

### Editor
Pode:
- ler imóveis;
- criar e editar somente imóveis em rascunho;
- gerenciar mídia somente de imóveis em rascunho;
- ler dados institucionais;
- ler leads;
- alterar status de leads.

Não pode:
- publicar ou destacar imóvel;
- arquivar imóvel;
- editar dados institucionais;
- gerenciar depoimentos;
- apagar dados pessoais de lead;
- consultar trilha de auditoria;
- gerenciar equipe.

### Gestor
Possui todas as capacidades operacionais e administrativas.

## Controles existentes

- `requireCapability()` falha fechado para papel desconhecido.
- Editor não recebe capacidades administrativas.
- publicação/destaque são verificadas antes da persistência;
- banco repete a restrição de rascunho para Editor;
- mídia verifica o imóvel pai real antes de qualquer mutação;
- storage path precisa pertencer ao namespace exato do imóvel;
- ordenação exige o conjunto exato de fotos daquele imóvel;
- gestor não consegue rebaixar/desativar/remover a própria identidade;
- gestor bootstrap não pode ser rebaixado, desativado ou removido;
- mudança de equipe revoga sessões da identidade afetada;
- payloads de equipe e auditoria não expõem OpenID;
- payload administrativo de fotos não expõe caminhos/metadados internos do storage.

## IDOR e manipulação de recursos

Foram revisados:

- `GET/PUT/DELETE /api/admin/properties/:id`;
- presign de upload por `propertyId`;
- cadastro de foto em `/properties/:id/photos`;
- remoção de foto por ID;
- troca de capa por ID;
- reordenação de galeria;
- leads por ID;
- depoimentos por ID;
- equipe por e-mail.

Para mídia, a rota resolve a foto, descobre o imóvel pai e aplica autorização sobre o imóvel real antes da mutação.

A persistência repete a regra de `requireDraft` para operações de Editor.

## Achados

### F3-01 — Elevação Editor → Gestor por payload
**Resultado:** Não encontrada

Papel e capabilities são derivados da sessão revalidada no servidor. Campos extras e tipos inesperados são rejeitados pelos contratos de entrada.

### F3-02 — Editor publicar/destacar imóvel por chamada direta
**Resultado:** Bloqueado em duas camadas

- rota: `canCreateProperty` / `canRequestPublication`;
- banco: `enforcePropertyWriteScope(..., { requireDraft: true })`.

### F3-03 — Editor alterar mídia de imóvel publicado
**Resultado:** Bloqueado em duas camadas

- rota: `canManagePropertyMedia`;
- banco: `requireDraft` nas operações de galeria.

### F3-04 — IDOR por foto de outro imóvel
**Resultado:** Não reproduzido

Foto é resolvida pelo ID e autorização é aplicada ao imóvel pai real.

### F3-05 — Troca de `storagePath` entre imóveis
**Resultado:** Bloqueado

`storagePathBelongsToProperty()` exige o namespace:
`gisley/properties/<propertyId>/...`.

### F3-06 — Reordenação com IDs duplicados ou de outro recurso
**Resultado:** Bloqueado

- entrada rejeita duplicados e IDs inválidos;
- persistência compara o conjunto completo recebido com o conjunto real do imóvel.

### F3-07 — Vazamento de metadados internos no CRM
**Severidade:** Preventiva
**Status:** Gate adicionado

Foi adicionado teste para impedir regressão de campos como:
- `storage_path`;
- `storage_provider`;
- MIME;
- tamanho/dimensões;
- `uploaded_by`;
- `property_id`.

## Decisão arquitetural importante

Não há ownership individual por corretor nesta versão. Recursos pertencem ao workspace da imobiliária, não a um usuário específico.

Portanto, um Editor autorizado pode trabalhar em rascunhos criados por outro Editor. Isso é intencional e não é tratado como IDOR.

Se futuramente houver filiais, franquias ou carteiras privadas por corretor, será necessária uma camada adicional de tenant/ownership no banco e nas policies.

## Gate da Fase 3

A fase é **PASS** somente se:

- papel desconhecido falhar fechado;
- Editor não possuir capability administrativa;
- chamadas diretas não permitirem publicação/destaque/arquivo;
- persistência repetir as restrições críticas;
- mídia não puder atravessar o limite entre imóveis;
- IDs e ordens malformados forem rejeitados;
- gestor/self/bootstrap permanecerem protegidos;
- dados internos de identidade/storage não vazarem por presenters;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 4 — Origem, CSRF e domínio administrativo**

A próxima revisão vai atacar:
- Host;
- Origin;
- Sec-Fetch-Site;
- subdomínio público × painel;
- callback OAuth no host errado;
- proxy spoofing;
- X-Forwarded-*;
- mutações cross-site;
- requisições sem Origin;
- métodos seguros versus mutações.
