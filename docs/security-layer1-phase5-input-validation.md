# Camada 1 — Fase 5: Validação de entrada

Data: 2026-10-01
Branch: `audit/security-design-2026-09-30`

## Escopo

Revisar todos os `req.body`, `req.params` e `req.query`, parser JSON, tipos, enums, números, e-mails, IDs, slugs, paths, Unicode, content type e contratos fechados.

## Arquitetura validada

- JSON limitado a 256 KB.
- Query parser simples.
- Objetos de entrada usam contrato fechado: chaves extras são rejeitadas.
- Arrays/objetos em campos escalares são rejeitados.
- IDs possuem limite e charset explícito.
- Slugs possuem formato explícito.
- Uploads, fotos, equipe, leads, site, depoimentos e imóveis possuem normalizadores próprios.
- Queries SQL permanecem parametrizadas.

## Achados

### F5-01 — Erros de validação podiam cair em 500
Severidade: Média
Status: Corrigido

Códigos como `INVALID_PROPERTY`, `INVALID_ID`, `INVALID_FILE` e `INVALID_TEAM_MEMBER` não estavam todos mapeados no handler HTTP.

Correção:
- novo `server/errors.js`;
- contrato HTTP central;
- validações conhecidas retornam 4xx;
- conflitos retornam 409;
- configuração indisponível retorna 503;
- erro desconhecido continua opaco como `500 INTERNAL_ERROR`.

### F5-02 — JSON malformado e body oversized eram tratados genericamente
Severidade: Média-baixa
Status: Corrigido

- JSON inválido → `400 INVALID_JSON`;
- body acima de 256 KB → `413 PAYLOAD_TOO_LARGE`.

### F5-03 — Representações numéricas ambíguas
Severidade: Baixa
Status: Corrigido

Strings como:
- `1e6`;
- `0x10`;
- `+10`;
- `.5`;
- `1.`

não são mais aceitas. Strings numéricas aceitam somente decimal simples.

### F5-04 — Validação de e-mail duplicada
Severidade: Baixa
Status: Corrigido

Foi criado `normalizeEmailAddress()` e reutilizado em:
- formulário público;
- configurações do site;
- equipe;
- parâmetros de rota da equipe.

### F5-05 — Unicode bidi de override/isolamento
Severidade: Baixa
Status: Corrigido

Caracteres de controle bidi de embedding/override/isolate são rejeitados em campos textuais para evitar spoofing visual em títulos, nomes e CRM.

### F5-06 — propertyPath do contato permissivo
Severidade: Baixa
Status: Corrigido

Agora aceita somente:
- `/`;
- `/contato`;
- `/imoveis`;
- `/imoveis/<slug-valido>`.

Paths relativos manipulados, percent-encoded traversal, query strings e rotas internas são rejeitados.

### F5-07 — Media type de API não era explícito
Severidade: Baixa
Status: Corrigido

Requests de API com body agora exigem `application/json`.

Body com `text/plain` ou outro media type recebe:
`415 UNSUPPORTED_MEDIA_TYPE`.

Rotas sem body, como logout, continuam funcionando sem Content-Type.

### F5-08 — Slug público validado apenas implicitamente
Severidade: Baixa
Status: Corrigido

`getPropertyBySlug()` agora normaliza/valida o slug também na fronteira do banco.

## Testes adversariais adicionados

- JSON quebrado;
- >256 KB;
- chaves extras;
- arrays/objetos em campos escalares;
- hexadecimal;
- notação científica;
- NaN/Infinity;
- e-mails malformados;
- Unicode bidi;
- path traversal literal e percent-encoded;
- IDs longos/caracteres inválidos;
- media type não JSON;
- validações conhecidas não virando 500.

## Gate

PASS quando:
- CI verde;
- CodeQL verde;
- malformed JSON PASS;
- payload oversized PASS;
- closed contracts PASS;
- numeric syntax PASS;
- email normalization PASS;
- IDs/slugs PASS;
- bidi/control chars PASS;
- content-type enforcement PASS;
- error mapping PASS.

## Próxima fase

Fase 6 — XSS e saída para navegador:
- EJS escaping;
- innerHTML;
- atributos;
- URLs;
- JSON embutido;
- stored XSS em imóvel, lead, equipe e depoimento;
- CSP;
- javascript:/data: URLs;
- DOM sinks.
