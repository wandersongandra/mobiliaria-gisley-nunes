# Camada 1 — Fase 1: Superfície de ataque e matriz de acesso

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Inventariar todas as superfícies HTTP relevantes, classificar o nível de acesso esperado e garantir que nenhuma rota administrativa alcance lógica de negócio sem autenticação.

## Níveis de acesso

- **Público:** disponível ao visitante sem sessão.
- **Público + mesma origem:** visitante sem sessão, porém mutação aceita apenas da própria origem.
- **Painel público:** necessário para iniciar autenticação ou descobrir estado de sessão; restrito ao domínio administrativo quando `ADMIN_ORIGIN` estiver configurado.
- **Autenticado:** exige usuário ativo com papel `manager` ou `editor`.
- **Gestor:** exige papel `manager`.
- **Interno operacional:** endpoint técnico de saúde/readiness, sem dados de negócio.

## Site e páginas públicas

| Método | Rota | Acesso | Observação |
|---|---|---|---|
| GET | `/` | Público | Home |
| GET | `/imoveis` | Público | Catálogo |
| GET | `/sobre` | Público | Institucional |
| GET | `/contato` | Público | Contato |
| GET | `/privacidade` | Público | Política |
| GET | `/imoveis/:slug` | Público | Somente imóvel publicado |
| GET | `/robots.txt` | Público | Bloqueia áreas internas de crawler |
| GET | `/sitemap.xml` | Público | Somente URLs públicas |
| GET | `/llms.txt` | Público | Conteúdo institucional público |
| GET | `/admin/*` | Painel público | Apenas shell/login; dados continuam protegidos pela API |

## Operação e saúde

| Método | Rota | Acesso | Observação |
|---|---|---|---|
| GET | `/_app/health` | Interno operacional | Liveness; resposta mínima |
| GET | `/_app/ready` | Interno operacional | Readiness; resposta reduzida a `{ ok }` |

## Autenticação

| Método | Rota | Acesso | Proteções |
|---|---|---|---|
| GET | `/api/auth/login` | Painel público | Rate limit + `ADMIN_ORIGIN` |
| GET | `/api/auth/callback` | Painel público | Rate limit + `ADMIN_ORIGIN` + state OAuth |
| POST | `/api/auth/logout` | Público + mesma origem | Same-origin; operação idempotente |
| POST | `/api/auth/logout-all` | Autenticado | Same-origin + sessão válida; revoga todos os dispositivos |
| GET | `/api/admin/session` | Painel público | No-store; devolve apenas `name/email/role` quando autenticado |

`/api/admin/session` é a única exceção anônima intencional sob `/api/admin`. Ela existe para o frontend decidir entre tela de login e CRM.

## API pública

| Método | Rota | Acesso | Proteções |
|---|---|---|---|
| GET | `/api/properties` | Público | Apenas publicados + presenter público + cache |
| GET | `/api/properties/:slug` | Público | Apenas publicado + presenter público + cache |
| GET | `/api/site` | Público | Somente dados institucionais/depoimentos públicos |
| POST | `/api/contact` | Público + mesma origem | Same-origin + rate limit + honeypot + validação |
| GET | `/media/*` | Público | Namespace validado + redirecionamento temporário assinado |
| GET | `/manus-storage/*` | Desativado por padrão | Só existe se `ENABLE_LEGACY_STORAGE_ROUTE=true` |

## CRM — Editor ou Gestor

Todas as rotas abaixo passam, antes da lógica de negócio, por:

1. `requireAdminOrigin` quando `ADMIN_ORIGIN` está configurado;
2. `requireSameOrigin`;
3. rate limit administrativo em mutações;
4. `requireAdmin()`;
5. `Cache-Control: no-store`.

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/admin/properties` | Autenticado |
| POST | `/api/admin/properties` | Autenticado |
| GET | `/api/admin/properties/:id` | Autenticado |
| PUT | `/api/admin/properties/:id` | Autenticado |
| DELETE | `/api/admin/properties/:id` | Autenticado |
| POST | `/api/admin/uploads/presign` | Autenticado |
| POST | `/api/admin/properties/:id/photos` | Autenticado |
| DELETE | `/api/admin/photos/:id` | Autenticado |
| PUT | `/api/admin/properties/:id/photos/order` | Autenticado |
| PUT | `/api/admin/photos/:id/cover` | Autenticado |
| GET | `/api/admin/site` | Autenticado |
| GET | `/api/admin/leads` | Autenticado |
| PATCH | `/api/admin/leads/:id` | Autenticado |

## CRM — somente Gestor

| Método | Rota | Acesso |
|---|---|---|
| PUT | `/api/admin/site` | Gestor |
| POST | `/api/admin/testimonials` | Gestor |
| DELETE | `/api/admin/testimonials/:id` | Gestor |
| DELETE | `/api/admin/leads/:id` | Gestor |
| GET | `/api/admin/audit` | Gestor |
| GET | `/api/admin/team` | Gestor |
| GET | `/api/admin/team/invitations` | Gestor |
| POST | `/api/admin/team/invitations` | Gestor |
| DELETE | `/api/admin/team/invitations/:email` | Gestor |
| POST | `/api/admin/team` | Gestor |
| PATCH | `/api/admin/team/:email` | Gestor |
| DELETE | `/api/admin/team/:email` | Gestor |

## Achados da Fase 1

### F1-01 — Exposição desnecessária do OpenID da sessão
**Severidade:** Baixa  
**Status:** Corrigido

A sonda `/api/admin/session` devolvia o objeto administrativo completo, incluindo o identificador interno `openId` do provedor OAuth.

**Correção:** resposta reduzida para `name`, `email` e `role`.

### F1-02 — Readiness informava estado interno do banco
**Severidade:** Baixa  
**Status:** Corrigido

`/_app/ready` distinguia publicamente `not_configured` de `unavailable`.

**Correção:** contrato público reduzido a `{ ok: boolean }`.

### F1-03 — Endpoint legado de storage sempre registrado
**Severidade:** Média-baixa  
**Status:** Corrigido

A rota pública `/manus-storage/*` permanecia ativa mesmo na arquitetura nova R2.

**Correção:** rota removida da superfície padrão. Só é registrada com `ENABLE_LEGACY_STORAGE_ROUTE=true`.

### F1-04 — Bypass anônimo de rotas administrativas
**Severidade:** Crítica se existente  
**Resultado:** Não encontrado

Foi adicionada uma bateria que chama todas as rotas administrativas conhecidas sem sessão. Todas devem bloquear antes de atingir a lógica de negócio.

### F1-05 — Métodos HTTP inesperados
**Severidade:** Baixa  
**Resultado:** Sem comportamento alternativo identificado

Métodos não implementados caem em contrato de API `404`; sob `/api/admin`, requisições anônimas continuam passando primeiro pelo guard administrativo.

## Exceções intencionais

- O HTML de `/admin` pode ser entregue sem sessão: ele contém apenas o shell/login; dados reais vêm exclusivamente da API protegida.
- `/api/admin/session` é anônimo por desenho, mas não entrega dados quando não existe sessão válida.
- Logout não exige sessão válida porque limpar um cookie inexistente é uma operação segura e idempotente.
- Health/readiness permanecem tecnicamente acessíveis, porém com respostas mínimas e sem dados de negócio.

## Gate da Fase 1

A fase é considerada **PASS** somente se:

- todas as rotas administrativas conhecidas bloquearem acesso anônimo;
- a única exceção anônima em `/api/admin` for `/api/admin/session`;
- rotas de Gestor estiverem explicitamente marcadas com `requireManager()`;
- API pública não expuser IDs/caminhos internos;
- endpoint legado de storage estiver desligado por padrão;
- métodos não suportados não acionarem lógica alternativa;
- CI e CodeQL permanecerem verdes após as alterações.

## Próxima fase

**Fase 2 — Autenticação e sessão**

A próxima revisão deverá atacar OAuth state/nonce, cookies, JWT, expiração, revogação, reuso de sessão, usuário removido, alteração de papel, redirect URI e comportamento de sessões adulteradas.
