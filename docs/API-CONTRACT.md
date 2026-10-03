# Contrato HTTP do backend

Respostas administrativas e de autenticação usam `Cache-Control: no-store`. Mutações web usam CSRF Laravel, exceto `POST /api/contact`, que é protegida por origem exata e rate limit. Rotas sob `api/admin` também exigem `same-origin`, sessão administrativa e capability.

## Públicas

| Método e rota | Auth | Request/resultado | Limite e erros |
| --- | --- | --- | --- |
| `GET /health/live`, `/_app/health` | Não | `{status:"ok"}` | Sem dependência externa. |
| `GET /health/ready` | Não | `{status:"ok"}` se DB responde | `503` se DB indisponível. |
| `GET /api/properties` | Não | Contrato legado: `{properties: []}` completo | Emite `Deprecation: true` e link para v2. Manter até a janela de remoção ser anunciada. |
| `GET /api/v2/properties` | Não | `page`, `per_page` 20–100 e filtros `purpose`, `location`, `type`, `price_band`, `bedrooms`; `{properties,pagination,facets}` | `422` para paginação/filtros inválidos; IDs internos omitidos. |
| `GET /api/properties/{slug}` | Não | Imóvel publicado | `404` para slug inválido/inexistente. |
| `GET /api/site` | Não | Configuração e depoimentos públicos | Cache público. |
| `POST /api/contact` | Origem exata | nome, email, interesse, mensagem, propertyPath, honeypot | 8/10 min por IP; `400` para entrada inválida, `201` para aceito. |
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

## Administração

| Rota | Capability | Resultado e erros |
| --- | --- | --- |
| `GET/POST /api/admin/properties` | `property.read` / `property.write` | Lista paginada ou cria; `403`, `409`, `422`. |
| `GET/PUT/DELETE /api/admin/properties/{id}` | `property.read` / `property.write` / `property.archive` | UUID obrigatório; delete arquiva. |
| `POST /api/admin/uploads/presign` | `media.manage` | Presign R2 curto; 120/10 min por IP. |
| `POST /api/admin/properties/{id}/photos` | `media.manage` | Registra foto após validar R2; `409` limite/duplicidade. |
| `GET /api/admin/photos/{id}/media` | `property.read` | Redirect R2 curto. |
| `DELETE /api/admin/photos/{id}` | `media.manage` | Remove registro e tenta remoção R2. |
| `PUT /api/admin/properties/{id}/photos/order`, `PUT /api/admin/photos/{id}/cover` | `media.manage` | UUIDs e ordenação estrita. |
| `GET/PUT /api/admin/site` | `site.read` / `site.manage` | Configuração pública. |
| `POST/DELETE /api/admin/testimonials[/{id}]` | `testimonial.manage` | Cria/remove depoimento. |
| `GET /api/admin/leads`, `/export` | `lead.read` | Filtros status/data; export streaming CSV/JSON. |
| `PATCH/DELETE /api/admin/leads/{id}` | `lead.status` / `lead.erase` | Atualiza/apaga lead. |
| `GET /api/admin/audit` | `audit.read` | `limit` 1–250. |
| `GET/POST/PATCH/DELETE /api/admin/team...` | `team.manage` | Equipe, convites e revogação. |

Erros consistentes: `401 AUTH_REQUIRED`, `403 CAPABILITY_REQUIRED`, `404 NOT_FOUND`, `409` para conflito, `419 CSRF_TOKEN_MISMATCH`, `422` para validação e `429` para throttle. Erros internos retornam `INTERNAL_ERROR` em produção.
