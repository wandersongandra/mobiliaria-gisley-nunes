# Auditoria de rotas, URLs e links — Gisley Nunes

**Data:** 14/10/2026 (America/Fortaleza)<br>
**Escopo:** checkout local `codex/route-audit-latest-2026-10-14`, origem `origin/main` no SHA `3bde88ca35afc1ba2f41686997924fe25c4b3a65`; site público `https://www.gisleynunesimoveis.com.br`.<br>
**Limite:** nenhuma ação autenticada, envio de formulário, deploy ou alteração de produção foi feita. Dados privados não foram consultados.

## Resumo executivo

- **61 declarações de rota** em `php artisan route:list --json`: 40 `GET|HEAD`, 6 `DELETE`, 2 `PATCH`, 9 `POST` e 4 `PUT`.
- **7 páginas HTML principais** rastreadas publicamente; 159 ocorrências de âncoras no HTML, 8 destinos internos únicos no crawl estático e mais 1 destino interno único na navegação hidratada do catálogo. 1 âncora externa HTTPS (WhatsApp) e 1 `mailto:`. O link de WhatsApp chegou a HTTP 200 após um redirecionamento; nenhuma mensagem foi enviada.
- **3 formulários de contato** revisados (home, contato e detalhe). Correção local: `method=POST` e `action=/api/contact` explícitos para que desativar JavaScript não transporte campos pessoais pela URL.
- **2 achados P1 corrigidos localmente**: método/action ausentes nos formulários e parâmetros padrão poluindo a URL canônica do catálogo após hidratação.
- **1 achado P2 pendente de infraestrutura**: preflight público `/api/contact` respondeu `Access-Control-Allow-Origin: *`; a origem da configuração está fora do código rastreado e requer ajuste/validação no servidor.
- Produção não foi alterada. Um teste de browser contra o domínio continua reproduzindo a URL com `?page=1&per_page=20`, como esperado antes da publicação da correção local.

## Inventário completo de rotas declaradas

Inventário extraído de `php artisan route:list --json` no checkout atual. Rotas marcadas como protegidas não foram chamadas em produção; middleware indica o limite previsto no código. `GET|HEAD` representa a declaração Laravel para ambos os métodos.

| Método | Rota | Proteção/controle observado | HTTP público observado / resultado |
|---|---|---|---|
| GET\|HEAD | `/` | pública | 200 |
| GET\|HEAD | `/_app/health` | pública | 200 (health) |
| GET\|HEAD | `/admin` | admin-origin; login shell | 200 após 3 hops no domínio público |
| GET\|HEAD | `/anuncie-seu-imovel` | pública, alias legado | redireciona para `/servicos` |
| GET\|HEAD | `/api/admin/audit` | admin + `audit.read`, same-origin, throttle | privada; código inspecionado, não chamada live |
| GET\|HEAD | `/api/admin/leads` | admin + `lead.read`, same-origin, throttle | privada; código inspecionado, não chamada live |
| GET\|HEAD | `/api/admin/leads/export` | admin + `lead.read`, throttle de exportação | privada; código inspecionado, não chamada live |
| PATCH | `/api/admin/leads/{id}` | admin + `lead.status`, same-origin, throttle | privada; não chamada live |
| DELETE | `/api/admin/leads/{id}` | admin + `lead.erase`, throttle destrutivo | privada; não chamada live |
| DELETE | `/api/admin/photos/{id}` | admin + `media.manage`, throttle destrutivo | privada; não chamada live |
| PUT | `/api/admin/photos/{id}/cover` | admin + `media.manage` | privada; não chamada live |
| GET\|HEAD | `/api/admin/photos/{id}/media` | admin + `property.read` | privada; não chamada live |
| GET\|HEAD | `/api/admin/properties` | admin + `property.read` | privada; não chamada live |
| POST | `/api/admin/properties` | admin + `property.write` | privada; não chamada live |
| GET\|HEAD | `/api/admin/properties/{id}` | admin + `property.read` | privada; não chamada live |
| PUT | `/api/admin/properties/{id}` | admin + `property.write` | privada; não chamada live |
| DELETE | `/api/admin/properties/{id}` | admin + `property.archive`, throttle destrutivo | privada; não chamada live |
| POST | `/api/admin/properties/{id}/photos` | admin + `media.manage`, throttle de upload | privada; não chamada live |
| PUT | `/api/admin/properties/{id}/photos/order` | admin + `media.manage` | privada; não chamada live |
| GET\|HEAD | `/api/admin/session` | admin-origin, throttle; resposta mínima de sessão | sessão não autenticada verificada apenas localmente |
| GET\|HEAD | `/api/admin/site` | admin + `site.read` | privada; não chamada live |
| PUT | `/api/admin/site` | admin + `site.manage` | privada; não chamada live |
| GET\|HEAD | `/api/admin/team` | admin + `team.manage` | privada; não chamada live |
| POST | `/api/admin/team` | admin + `team.manage` | privada; não chamada live |
| GET\|HEAD | `/api/admin/team/invitations` | admin + `team.manage` | privada; não chamada live |
| POST | `/api/admin/team/invitations` | admin + `team.manage` | privada; não chamada live |
| DELETE | `/api/admin/team/invitations/{email}` | admin + `team.manage`, throttle destrutivo | privada; não chamada live |
| PATCH | `/api/admin/team/{email}` | admin + `team.manage` | privada; não chamada live |
| DELETE | `/api/admin/team/{email}` | admin + `team.manage`, throttle destrutivo | privada; não chamada live |
| POST | `/api/admin/testimonials` | admin + `testimonial.manage` | privada; não chamada live |
| DELETE | `/api/admin/testimonials/{id}` | admin + `testimonial.manage`, throttle destrutivo | privada; não chamada live |
| POST | `/api/admin/uploads/presign` | admin + `media.manage`, throttle de upload | privada; não chamada live |
| GET\|HEAD | `/api/auth/callback` | admin-origin, limite de body, throttle | fluxo OAuth inspecionado; não iniciado |
| GET\|HEAD | `/api/auth/login` | admin-origin, limite de body, throttle | fluxo OAuth inspecionado; não iniciado |
| POST | `/api/auth/logout` | admin-origin, same-origin, throttle | mutação; não chamada |
| POST | `/api/auth/logout-all` | admin + admin-origin, same-origin, throttle | mutação; não chamada |
| POST | `/api/contact` | body limit, same-origin, throttle de contato | OPTIONS 204; POST não submetido |
| GET\|HEAD | `/api/properties` | pública, throttle de API | 200, catálogo vazio |
| GET\|HEAD | `/api/properties/{slug}` | pública, throttle de API | slug inválido: 404 |
| GET\|HEAD | `/api/site` | pública, throttle de API | 200 |
| GET\|HEAD | `/api/v2/properties` | pública, throttle de API | 200; parâmetro `per_page` inválido: 422 |
| GET\|HEAD | `/bairros` | pública | 200 |
| GET\|HEAD | `/bairros/{slug}` | pública | slug inválido: 404; nenhum bairro com inventário publicado para validar sucesso |
| GET\|HEAD | `/contato` | pública | 200 |
| GET\|HEAD | `/health/live` | pública | 200 |
| GET\|HEAD | `/health/ready` | pública | 200 |
| GET\|HEAD | `/imoveis` | pública | 200; inválido `purpose`: 200 com noindex |
| GET\|HEAD | `/imoveis-a-venda` | pública, alias legado | redireciona para `/imoveis?purpose=Comprar` |
| GET\|HEAD | `/imoveis-para-alugar` | pública, alias legado | redireciona para `/imoveis?purpose=Alugar` |
| GET\|HEAD | `/imoveis/{slug}` | pública | slug inválido: 404; não há imóvel publicado para validar sucesso |
| GET\|HEAD | `/llms.txt` | pública | 200 |
| GET\|HEAD | `/media/{path}` | pública, arquivo governado | arquivo inexistente: 404 JSON |
| GET\|HEAD | `/oauth/google/return` | admin-origin, throttle | callback inspecionado; não iniciado |
| GET\|HEAD | `/politica-de-privacidade` | pública, alias legado | redireciona para `/privacidade` |
| GET\|HEAD | `/privacidade` | pública, `noindex,follow` | 200 |
| GET\|HEAD | `/robots.txt` | pública | 200 |
| GET\|HEAD | `/servicos` | pública | 200 |
| GET\|HEAD | `/sitemap.xml` | pública | 200; 6 URLs, todas 200 |
| GET\|HEAD | `/sobre` | pública | 200 |
| GET\|HEAD | `/{fallbackPlaceholder}` | fallback público | URL desconhecida: 404 com `noindex` |
| GET\|HEAD | `/{legacyPropertySlug}` | pública, compatibilidade de slug legado | não enumerável sem dados; URL inválida retorna 404 |

**Observação de contagem:** o inventário total é 61 declarações: 40 `GET|HEAD`, 6 `DELETE`, 2 `PATCH`, 9 `POST` e 4 `PUT`. OPTIONS do contato é tratado por middleware/servidor, sem rota OPTIONS declarada no Laravel.

## URLs e páginas públicas verificadas

Rastreamento HTTP e navegador real no domínio canônico. Os sete documentos principais retornaram 200, com conteúdo SSR, title, description, H1, canonical absoluto, Open Graph/Twitter e JSON-LD sintaticamente válido. O domínio canônico foi alcançado em um hop a partir de HTTP e HTTPS sem `www`.

| URL | Origem | Status/final | Title/H1/canonical/indexação | Resultado |
|---|---|---|---|---|
| `/` | sitemap e navegação | 200 | únicos; canonical absoluto; indexável | OK, SSR |
| `/imoveis` | menu, sitemap | 200 | canonical sem query; indexável no HTML inicial | P1 corrigido localmente: JavaScript adicionava parâmetros padrão e tornava a URL noindex |
| `/sobre` | menu, sitemap | 200 | únicos; canonical; indexável | OK |
| `/servicos` | menu, sitemap e redirect legado | 200 | únicos; canonical; indexável | OK |
| `/bairros` | menu, sitemap | 200 | únicos; canonical; indexável | OK; catálogo sem bairros publicados |
| `/contato` | menu e sitemap | 200 | únicos; canonical; indexável | OK; formulário corrigido localmente |
| `/privacidade` | rodapé e alias legado | 200 | canonical absoluto; `noindex,follow` | OK; corretamente ausente do sitemap |
| `/sitemap.xml` | robots | 200 | 6 URLs, todas respondem 200 | OK |
| `/robots.txt` | caminho padrão | 200 | aponta sitemap e restringe áreas de API/admin | OK |
| `/llms.txt` | caminho padrão | 200 | conteúdo descoberto | OK |
| `/imoveis?purpose=invalid` | teste de parâmetro | 200 | canonical limpo; noindex | OK, filtro inválido não indexável |
| `/imoveis/{slug-inexistente}` | teste de slug | 404 | noindex | OK |
| `/bairros/{slug-inexistente}` | teste de slug | 404 | noindex | OK |
| `/rota-inexistente` | teste fallback | 404 | noindex e landmark principal | OK; sem soft-404 observado |

Titles, H1s e descrições das sete páginas HTML rastreadas foram distintos. Não foram observadas duplicações, links internos apontando a fragmentos inexistentes nem Schema JSON inválido. Não foi possível validar metadados de uma página válida de imóvel/bairro porque a API pública retorna zero imóveis publicados.

## Links quebrados e redirecionamentos

| Origem | Destino | Evidência | Prioridade/correção |
|---|---|---|---|
| Home, contato e detalhe de imóvel | `/api/contact` | Formulários sem `method`/`action` usavam GET por padrão sem JS, colocando dados de contato na URL | P1; corrigido localmente para POST explícito e coberto por PHPUnit |
| Catálogo hidratado | `/imoveis?page=1&per_page=20` | Defaults redundantes alteravam URL pública e acionavam noindex | P1; removidos da serialização local; teste de browser adicionado |
| Origem externa do servidor | preflight `/api/contact` | OPTIONS 204 com `Access-Control-Allow-Origin: *` | P2 pendente; determinar configuração Apache/HostGator antes de mudar produção |

Redirecionamentos de aliases legados (todos com um hop): `/anuncie-seu-imovel` → `/servicos`; `/imoveis-a-venda` → `/imoveis?purpose=Comprar`; `/imoveis-para-alugar` → `/imoveis?purpose=Alugar`; `/politica-de-privacidade` → `/privacidade`. HTTP e host sem `www` chegam ao domínio canônico em um hop. `/admin` teve três hops até a tela pública de login. Não foram vistos loops. `/imoveis/` responde 200 com canonical sem barra, sem quebra observada.

## Páginas órfãs, formulários e APIs

- Nenhuma das páginas do sitemap ficou órfã no crawl da navegação principal. `/privacidade` é acessível pelo rodapé e intencionalmente omitida do sitemap por ser noindex.
- Formulários encontrados: 3 formulários de contato (home, contato, detalhe). Todos agora declaram POST/action. Testes com dados fictícios locais cobrem renderização; nenhum envio real foi realizado.
- APIs públicas verificadas: `/api/properties`, `/api/v2/properties`, `/api/site`, `/api/properties/{slug}` e `/api/contact` (somente OPTIONS para este último). Rotas health públicas também responderam 200.
- APIs administrativas/auth: 28 rotas sob `/api/admin/*` (27 privilegiadas e `/api/admin/session`, probe minimizado), além de login/callback/logout. No código, rotas privilegiadas exigem origem administrativa, sessão, same-origin, throttle e capability adequada. Não foram chamadas no domínio publicado nem foram usados dados privados.
- Webhooks: nenhuma rota de webhook declarada. Não há rota OPTIONS Laravel explícita; preflight é respondido por camada intermediária.

## SEO, acessibilidade, performance e segurança

### SEO — P1

- `/imoveis` era indexável no HTML SSR, mas a hidratação adicionava os valores default `page=1&per_page=20`; a mesma aplicação usa query string como estado filtrado e marca essas URLs noindex. Correção local mantém a URL limpa até haver filtro real. Confirmação live aguarda deploy.
- Sitemap contém somente seis URLs canônicas indexáveis, cada uma testada em 200; privacidade é noindex e não consta no sitemap. Robots responde 200 e publica o endereço do sitemap.

### Acessibilidade e responsividade

- Axe: zero violações nas páginas amostradas ao vivo. Navegação do menu mobile e Escape passaram. Testes de viewport 320–1920 px não encontraram overflow horizontal. `prefers-reduced-motion` e foco/navegação básica verificados. Links visíveis sem texto e fragmentos quebrados não foram encontrados.
- Resultado de Axe foi isolado do erro de console causado pela injeção da folha de estilos do próprio Axe sob CSP; isso não foi classificado como erro do site.

### Performance sintética (laboratório, sem dados de campo)

| Página | TTFB | FCP | LCP | CLS | HTML |
|---|---:|---:|---:|---:|---:|
| `/` | 53 ms | 604 ms | 768 ms | 0,0004 | 13.250 bytes |
| `/imoveis` | 102 ms | 160 ms | 160 ms | 0 | 9.362 bytes |
| `/contato` | 44 ms | 112 ms | 112 ms | 0 | 8.018 bytes |

INP e Core Web Vitals de campo não foram medidos. CSS compilado: 74,70 KB (14,64 KB gzip); JavaScript: 25,69 KB (8,34 KB gzip).

### Segurança — P2 pendente externo

- Headers vistos ao vivo: HSTS, `nosniff`, X-Frame-Options DENY, Referrer-Policy strict-origin, Permissions-Policy restritiva e CSP com nonce/allowlist.
- Controles de origem/same-origin e testes locais de recusa a origem hostil foram revisados. Não houve tentativa de contornar login, CAPTCHA ou rate limiting.
- **P2:** CORS wildcard observado no preflight do contato. A documentação do projeto já identifica possível configuração Apache/HostGator não rastreada; precisa localizar a fonte efetiva e restringir à origem legítima em mudança separada, com validação no domínio.
- Não se confirmou exposição de dado privado. Arquivos/URLs de backup não foram enumerados além do escopo público normal.

## Correções realizadas

| Arquivos | Problema/causa | Alteração e reversão |
|---|---|---|
| `resources/views/home.blade.php`, `resources/views/contato.blade.php`, `resources/views/imovel.blade.php` | Form nativo sem action/method usava GET se JS falhasse | POST explícito para `/api/contact`; reversível removendo os atributos, embora não recomendado |
| `src/main.js`, `public/assets/main.js` | Serialização incluía page/per_page padrão sem filtro | Defaults omitidos na URL da página/API; reversível reintroduzindo os parâmetros padrão |
| `tests/Feature/PublicPageRenderTest.php` | Sem regressão cobrindo os formulários | Asserts para action/method nos três templates |
| `tests/browser/frontend.smoke.spec.js` | Sem teste que detectasse query padrão no catálogo | Teste browser verifica URL limpa |
| `public/assets/main.css` | Saída sincronizada do build atual | Artefato regenerado como parte do build; `test:source` confirmou sincronização |

## Validação executada

- `php artisan route:list --json`: 61 declarações de rota.
- `vendor/bin/phpunit --testsuite=Feature --do-not-cache-result`: 152 testes, 770 assertions — passou.
- `pnpm test`: 186 testes; 185 passaram, 1 teste de integração MySQL foi skipped.
- `pnpm run build`: passou.
- `pnpm run test:source`: passou; artefatos públicos sincronizados.
- `pnpm run test:browser`: 15 passaram no preview local.
- Playwright local Laravel e público: cinco verificações de browser cada passaram.
- Teste Playwright da URL limpa no domínio publicado falha reproduzindo `?page=1&per_page=20`; evidencia que produção continua no comportamento anterior e precisa receber a correção local.
- PHPStan: passou. Pint no arquivo PHPUnit alterado: passou. Pint global: falhou por diferenças de estilo/line endings espalhadas em arquivos não alterados; não foi aplicada formatação massiva.
- `php -l tests/Feature/PublicPageRenderTest.php`: passou. `git diff --check`: passou. Aviso de runtime: PHP local não encontrou extensão opcional `pdo_informix`; não bloqueou os checks.

## Pendências e checklist

- **PENDENTE:** publicar os arquivos modificados em janela autorizada e repetir o teste da URL do catálogo no domínio.
- **PENDENTE:** localizar e restringir configuração CORS wildcard na camada de servidor/HostGator.
- **PENDENTE:** fornecer/autorizar dados reais de imóvel/bairro para validar detalhes válidos; não foram inventados registros.
- **PENDENTE:** qualquer métrica de campo (CrUX/INP) e inspeção de estado autenticado; não medidos por escopo.

| Item | Estado |
|---|---|
| Todas as rotas inventariadas | OK (61 declarações no framework) |
| Todas as rotas públicas testadas | PENDENTE (detalhes de imóvel/bairro dependem de dados; métodos mutáveis não submetidos) |
| Rotas privadas identificadas | OK (sem acesso a dados privados) |
| APIs identificadas | OK |
| Sitemap e robots analisados | OK |
| Links internos e externos testados | OK (links externos não HTTP como `mailto:` não têm status) |
| Links quebrados corrigidos/documentados | OK para achados encontrados; CORS documentado como PENDENTE |
| Redirecionamentos e loops verificados | OK |
| Páginas órfãs identificadas | OK; nenhuma página-chave órfã encontrada |
| 404/5xx/soft-404 verificados | OK para URLs cobertas; slugs válidos dependem de dados |
| Formulários testados com dados fictícios | PENDENTE (renderização/testes de contrato passaram; envio HTTP intencionalmente não executado) |
| SEO, canonical e Schema verificados | OK para as sete páginas HTML públicas |
| Mobile e acessibilidade básica | OK na amostra pública e browser local |
| Performance medida | OK como laboratório sintético; campo PENDENTE |
| Segurança básica revisada | OK em código/headers; CORS PENDENTE |
| Testes automatizados | OK, com 1 integração MySQL skipped e Pint global fora do padrão |
| Diff revisado | OK; `git diff --check` passou |
| Deploy confirmado | PENDENTE; não solicitado nem realizado |

## Estado do Git e produção

- Branch: `codex/route-audit-latest-2026-10-14`, baseada em `origin/main` (`3bde88ca35afc1ba2f41686997924fe25c4b3a65`).
- Arquivos modificados: os sete indicados na tabela de correções e artefatos CSS/JS públicos. `cors.json` já estava não rastreado pelo usuário e foi preservado sem leitura/alteração.
- Há um stash de segurança criado durante a atualização para a branch atual: `codex route audit changes before rebasing on latest main`; foi mantido.
- Commit: NÃO REALIZADO. Push: NÃO REALIZADO. PR: NÃO ABERTO. Merge: NÃO REALIZADO. Deploy: NÃO REALIZADO.
- Validação do domínio publicado é distinta dos checks locais. A correção de URL e o achado CORS ainda exigem confirmação após ação autorizada de release/configuração.
