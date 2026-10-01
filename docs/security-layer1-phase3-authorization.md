# Camada 1 — Fase 3: Autorização e privilégio mínimo

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que o backend, e não apenas a interface, imponha os papéis Gestor e Editor; impedir promoção indevida, bypass por método HTTP, manipulação de equipe e referências cruzadas de objetos.

## Modelo de autorização

### Editor
Pode:
- listar, criar, editar e arquivar imóveis;
- trabalhar com fotos, capa e ordem da galeria;
- consultar dados públicos do site;
- consultar leads;
- alterar status de leads.

Não pode:
- alterar dados institucionais;
- criar/remover depoimentos;
- apagar dados pessoais de leads;
- consultar auditoria;
- listar ou administrar equipe.

### Gestor
Possui as permissões do Editor e também:
- dados institucionais;
- depoimentos;
- exclusão LGPD de leads;
- auditoria;
- equipe e permissões.

### Gestor bootstrap
Além do papel Gestor:
- é definido por `GISELY_ADMIN_EMAILS`;
- não pode ser removido;
- não pode ser rebaixado;
- não pode ser desativado;
- pelo menos um precisa existir em produção.

## Achados e correções

### F3-01 — POST de equipe funcionava como upsert
**Severidade:** Média  
**Status:** Corrigido

`POST /api/admin/team` podia alterar um e-mail já existente, permitindo contornar proteções implementadas somente no PATCH.

**Correção:** POST agora cria somente novos membros. E-mail existente retorna `409 TEAM_MEMBER_EXISTS`. Alterações obrigatoriamente passam pelo PATCH protegido.

---

### F3-02 — Gestor bootstrap podia receber `active=false` via PATCH
**Severidade:** Média  
**Status:** Corrigido

Embora o e-mail de ambiente continuasse sendo reconhecido como gestor no runtime, o estado persistido poderia ficar incoerente.

**Correção:** bootstrap manager não pode receber role diferente de manager nem `active=false`.

---

### F3-03 — Produção não exigia gestor bootstrap
**Severidade:** Alta  
**Status:** Corrigido

Uma produção com autenticação válida, porém sem gestor protegido, poderia depender somente de registros mutáveis no banco e perder o caminho de recuperação administrativa.

**Correção:** `assertAuthConfiguration()` exige ao menos um `GISELY_ADMIN_EMAILS` em produção.

---

### F3-04 — Bypass Editor → Gestor
**Severidade:** Crítica se existente  
**Resultado:** Não encontrado

Foi criada uma aplicação de teste com identidade Editor injetada no middleware administrativo. O teste chama diretamente todos os endpoints exclusivos de Gestor e exige `403 MANAGER_REQUIRED`.

Cobertos:
- PUT site;
- POST/DELETE depoimentos;
- DELETE lead;
- GET auditoria;
- GET/POST/PATCH/DELETE equipe.

---

### F3-05 — Método HTTP inesperado
**Severidade:** Média se contornasse middleware  
**Resultado:** Sem bypass

Método não implementado em rota administrativa não executa ação alternativa nem evita o guard de autenticação/autorização.

---

### F3-06 — Referência de storage de outro imóvel
**Severidade:** Alta  
**Status:** Corrigido

A finalização da foto já verificava prefixo, mas a regra foi centralizada e tornada explícita.

**Correção:** `storagePathBelongsToProperty()` exige namespace:
`gisley/properties/<propertyId>/...`

Rejeita:
- outro propertyId;
- traversal `..`;
- propertyId malformado com barras;
- namespace legado na finalização nova.

---

### F3-07 — Mesmo objeto de storage podia ser registrado mais de uma vez
**Severidade:** Alta  
**Status:** Corrigido

Duas linhas apontando para o mesmo objeto criariam risco de uma exclusão quebrar a outra referência.

**Correção:**
- `storage_path` agora é UNIQUE;
- replay gera `409 ASSET_ALREADY_REGISTERED`;
- em conflito por objeto já registrado, o backend **não apaga** o objeto existente;
- em falhas de persistência reais, o upload órfão continua sendo limpo.

---

### F3-08 — IDOR entre usuários
**Resultado:** Não aplicável no modelo atual

O produto é single-tenant: todos os Editores autorizados pertencem à mesma imobiliária e, por desenho, podem trabalhar em todo o portfólio e nos leads da empresa.

Portanto:
- Editor A acessar imóvel criado por Editor B é comportamento autorizado;
- Editor A atualizar lead recebido pela imobiliária é comportamento autorizado.

Se o produto evoluir para múltiplas imobiliárias/tenants, esta premissa deixa de ser válida e toda entidade deverá receber `tenant_id` com enforcement obrigatório no banco e nas queries.

## Decisões de privilégio aceitas

Nesta versão, Editor pode:
- publicar imóvel;
- arquivar imóvel;
- alterar capa;
- remover foto;
- alterar status do lead.

Essas ações são consideradas operações normais do catálogo e foram mantidas por produto. Se futuramente for desejado fluxo de aprovação, deve ser criado papel adicional como `publisher` ou workflow Draft → Review → Published.

## Testes adicionados

- Editor autenticado recebe 403 em toda rota exclusiva de Gestor.
- Método inesperado não contorna autorização.
- Caminho de storage do imóvel correto é aceito.
- Caminho de outro imóvel é rejeitado.
- Traversal é rejeitado.
- Namespace legado não pode ser usado para novo vínculo.
- Produção sem gestor bootstrap falha configuração.
- Rotas administrativas anônimas continuam retornando 401.

## Gate da Fase 3

A fase é PASS somente se:

- Editor não alcançar nenhuma ação exclusiva de Gestor;
- backend aplicar autorização independentemente da UI;
- bootstrap manager permanecer protegido;
- produção possuir caminho de recuperação administrativo;
- objetos de storage não puderem ser associados a outro imóvel;
- o mesmo objeto não puder ser registrado duas vezes;
- métodos inesperados não contornarem guards;
- CI, Docker e CodeQL permanecerem verdes.

## Próxima fase

**Fase 4 — Origem, CSRF e domínio administrativo**

A próxima fase deverá testar Host, Origin, Sec-Fetch-Site, spoofing de proxy, domínio público vs painel, callback OAuth em host incorreto, mutações sem Origin, requests cross-site e comportamento atrás do Cloudflare.
