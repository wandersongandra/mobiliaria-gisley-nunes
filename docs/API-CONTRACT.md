# Contrato HTTP do backend

Respostas administrativas e de autenticação usam `Cache-Control: no-store`. Mutações web usam CSRF Laravel, exceto `POST /api/contact`, que é protegida por origens explicitamente permitidas e rate limit. Rotas sob `api/admin` também exigem `same-origin`, sessão administrativa e capability, conforme o ambiente e sua configuração efetiva.

## Públicas

| Método e rota | Auth | Request/resultado | Limite e erros |
| --- | --- | --- | --- |
| `GET /health/live`, `/_app/health` | Não | `{status:"ok"}` | Sem dependência externa. |
| `GET /health/ready` | Não | `{status:"ok"}` se DB responde | `503` se DB indisponível. |
| `GET /api/properties` | Não | Contrato legado: `{properties: []}` completo | Emite `Deprecation: true` e link para v2. Manter até a janela de remoção ser anunciada. |
| `GET /api/v2/properties` | Não | `page`, `per_page` 20–100 e filtros `purpose`, `location`, `type`, `price_band`, `bedrooms`; `{properties,pagination,facets}` | `422` para paginação/filtros inválidos; IDs internos omitidos. |
| `GET /api/properties/{slug}` | Não | Imóvel publicado | `404` para slug inválido/inexistente. |
| `GET /api/site` | Não | Configuração e depoimentos públicos | Cache público. |
| `POST /api/contact` | Origens explicitamente permitidas | nome, email, interesse, mensagem, propertyPath, honeypot | 8/10 min por IP; `400` para entrada inválida, `201` para aceito. |
| `GET /media/{path}` | Não | Redireciona a URL R2 curta de foto publicada | `404` se não registrada/publicada. |

As páginas HTML, `robots.txt`, `sitemap.xml` e `llms.txt` são públicas e não recebem IDs internos administrativos.

## Autenticação

| Método e rota | Auth/origem | Resultado | Limite/erros |
| --- | --- | --- | --- |
| `GET /api/auth/login` | Não | Inicia OAuth, state de uso único | 30/10 min por IP; `400`, `503`. |
| `GET /api/auth/callback` | State de sessão + challenge DB | 303 para `/admin` ou mensagem segura | 30/10 min por IP; `400`, `403`, `409`. |
| `GET /api/admin/session` | Opcional | Sessão, papel e CSRF token | 120/5 min por IP. |
| `POST /api/auth/logout` | CSRF + origem | Revoga sessão atual | 300/5 min por IP. |
| `POST /api/auth/logout-all` | CSRF + origem + sessão | Revoga sessões ativas | 300/5 min por IP. |

### Rotas operacionais e de compatibilidade

Estas rotas existem no código e são relevantes para a operação, mas não ampliam o catálogo público de negócio:

| Método e rota | Classificação | Observação |
| --- | --- | --- |
| `GET /oauth/google/return` | Callback operacional/compatibilidade | Callback OAuth alternativo; usa a configuração de origem administrativa e o mesmo tratamento de callback. Não é endpoint público de catálogo. |
| `GET /api/admin/release` | Operacional administrativo | Requer `audit.read` e expõe informações de release para o painel. Não é endpoint público. |

## Administração

| Rota | Capability | Resultado e erros |
| --- | --- | --- |
| `GET/POST /api/admin/properties` | `property.read` / `property.write` | Lista paginada ou cria; `403`, `409`, `422`. |
| `GET/PUT/DELETE /api/admin/properties/{id}` | `property.read` / `property.write` / `property.archive` | UUID obrigatório; delete arquiva. |
| `POST /api/admin/properties/{id}/photos/upload` | `media.manage` | **Fluxo oficial:** recebe `multipart/form-data` (`photo`, com `altText`, `sortOrder` e `isCover` opcionais), valida o conteúdo real, faz o upload pelo backend ao R2 e registra a foto; retorna `photos` com `201`. |
| `POST /api/admin/uploads/presign` | `media.manage` | **Alternativa explícita:** emite presign R2 curto e os headers assinados para upload direto; não registra a foto sozinho. |
| `POST /api/admin/properties/{id}/photos` | `media.manage` | **Alternativa explícita:** registra uma foto já enviada ao R2 após conferir metadados, MIME e dimensões reais; `409` para limite/duplicidade. |
| `GET /api/admin/photos/{id}/media` | `property.read` | Redirect R2 curto. |
| `DELETE /api/admin/photos/{id}` | `media.manage` | Remove registro e tenta remoção R2. |
| `PUT /api/admin/properties/{id}/photos/order`, `PUT /api/admin/photos/{id}/cover` | `media.manage` | UUIDs e ordenação estrita. |
| `GET/PUT /api/admin/site` | `site.read` / `site.manage` | Configuração pública. |
| `POST/DELETE /api/admin/testimonials[/{id}]` | `testimonial.manage` | Cria/remove depoimento. |
| `GET /api/admin/leads`, `/export` | `lead.read` | Filtros status/data; export streaming CSV/JSON. A exportação usa limite dedicado de 20 requisições/10 min por IP. |
| `PATCH/DELETE /api/admin/leads/{id}` | `lead.status` / `lead.erase` | Atualiza/apaga lead. |
| `GET /api/admin/audit` | `audit.read` | `limit` 1–250. |
| `GET/POST/PATCH/DELETE /api/admin/team...` | `team.manage` | Equipe, convites e revogação. |

O catálogo acima é resumido e não pretende ser exaustivo. Entre os códigos recorrentes estão `401 AUTH_REQUIRED`, `403 CAPABILITY_REQUIRED`, `404 NOT_FOUND`, `409` para conflito, `419 CSRF_TOKEN_MISMATCH`, `422` para validação e `429` para throttle; rotas específicas também podem retornar erros de arquivo, asset, storage, OAuth ou indisponibilidade. Erros internos devem retornar `INTERNAL_ERROR` em produção.

### Enforcement por ambiente

As exigências de origem, sessão, CSRF, capability, limites e disponibilidade descritas aqui são o contrato esperado quando os respectivos middlewares e configurações estão ativos. `PUBLIC_ORIGIN`, `ADMIN_ORIGIN`, credenciais, proxies e políticas podem variar entre desenvolvimento, homologação e produção; cada ambiente precisa ser verificado separadamente. Este documento não prova que a configuração ou o enforcement do ambiente publicado esteja aplicado.

### Sequência oficial de salvar e publicar com fotos

O fluxo canônico do painel é:

1. **Salvar** o imóvel por `POST` ou `PUT /api/admin/properties`, normalmente como `draft` enquanto ainda não há capa.
2. **Fazer upload** de cada foto por `POST /api/admin/properties/{id}/photos/upload`.
3. O endpoint multipart **registra** a foto após o upload; `isCover=true` pode definir a capa na mesma operação. A capa também pode ser definida explicitamente por `PUT /api/admin/photos/{id}/cover`.
4. **Publicar** por `PUT /api/admin/properties/{id}` com `status=published`, somente depois de existir uma foto de capa.

O fluxo `presign` → upload direto ao R2 → `POST /api/admin/properties/{id}/photos` é uma alternativa explícita, não o fluxo padrão do painel. `presign` não substitui o registro e nenhuma rota de upload autoriza publicação sem a validação de capa.
