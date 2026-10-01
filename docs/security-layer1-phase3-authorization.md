# Camada 1 — Fase 3: Autorização e privilégio mínimo

Data: 2026-10-01
Branch: `audit/security-design-2026-09-30`

## Escopo

Validar capacidades por papel, escalada Editor → Gestor, publicação/arquivamento indevidos, mutação de mídia em recursos publicados, alteração de equipe, exposição de dados administrativos e consistência entre guard de rota e persistência.

## Modelo de capacidades

### Editor
- property.read
- property.write
- media.manage
- site.read
- lead.read
- lead.status

### Gestor
Inclui todas as capacidades do Editor, mais:
- property.publish
- property.archive
- site.manage
- testimonial.manage
- lead.erase
- audit.read
- team.manage

Papel desconhecido falha fechado.

## Achados

### F3-01 — Regra de status do Editor divergente da persistência
Severidade: Média-baixa
Status: Corrigido

O helper de autorização aceitava qualquer status diferente de `published`, enquanto a persistência exigia estritamente `draft`.

A persistência já impedia o bypass real, mas a inconsistência criava dependência perigosa da segunda barreira.

Correção:
- Editor só pode criar/alterar imóvel permanecendo em `draft`;
- tentativa de `published` ou `archived` falha no guard e na persistência.

### F3-02 — Representações alternativas de booleano
Severidade: Média-baixa
Status: Corrigido

O normalizador aceita `true`, `1`, `"1"` e `"true"` como verdadeiro. O guard agora reconhece todas as mesmas formas ao avaliar `featured`.

A persistência já bloqueava destaque indevido; agora as duas camadas usam semântica equivalente.

### F3-03 — Arquivamento protegido somente na rota
Severidade: Baixa
Status: Corrigido

`softDeleteProperty` agora também exige autorização explícita na fronteira de persistência.

Resultado: uma chamada interna futura sem `allowArchive` falha com `CAPABILITY_REQUIRED`.

### F3-04 — Rotas administrativas futuras sem capability
Severidade: Potencialmente alta
Status: Mitigado por gate estrutural

Foi criado um teste que lê `server/routes.js` e exige que toda rota `/api/admin/*` possua `requireCapability(...)`, exceto a sonda pública de sessão.

Qualquer nova rota administrativa sem capability faz o CI falhar.

## Proteções confirmadas

- Editor não publica;
- Editor não destaca;
- Editor não arquiva;
- Editor não altera mídia de imóvel publicado/arquivado;
- Editor não altera dados institucionais;
- Editor não gerencia depoimentos;
- Editor não apaga lead;
- Editor não acessa auditoria;
- Editor não gerencia equipe;
- Gestor não remove/rebaixa a própria identidade;
- Gestor bootstrap não pode ser removido/rebaixado/desativado;
- mudança/removal de equipe revoga sessões;
- API de equipe não expõe OpenID;
- auditoria não expõe OpenID nem detalhes internos;
- persistência também aplica restrições críticas de propriedade/mídia.

## IDOR

O sistema atual é single-tenant: os usuários autorizados operam a carteira da mesma imobiliária, portanto não existe fronteira de tenant/cliente entre imóveis.

Ainda assim:
- IDs são validados;
- queries são parametrizadas;
- foto é resolvida para seu imóvel antes da mutação;
- mídia só pode ser gerenciada se o papel puder atuar sobre o status daquele imóvel;
- storage path é vinculado ao propertyId esperado.

## Gate

PASS quando:
- CI verde;
- CodeQL verde;
- capability matrix PASS;
- papel desconhecido fail-closed PASS;
- Editor → Gestor via API FAIL;
- publish/archive/featured por Editor FAIL;
- mídia de imóvel publicado por Editor FAIL;
- team/audit/site/lead.erase por Editor FAIL;
- self/bootstrap protection PASS;
- persistência de archive/draft scope PASS.

## Próxima fase

Fase 4 — Origem, CSRF e domínio administrativo:
- Host malformado;
- Origin null;
- same-site vs same-origin;
- X-Forwarded-* spoofing;
- callback OAuth no host errado;
- domínio público tentando chamar painel;
- painel tentando mutar endpoint público;
- comportamento com e sem Cloudflare proxy confiável.
