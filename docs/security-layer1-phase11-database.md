# Camada 1 — Fase 11: Banco e proteção básica dos dados

Data da revisão: 2026-10-01
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Revisar SQL injection, conexão, transações, concorrência, constraints e exposição básica de dados.

## SQL

Valores externos são enviados por placeholders/prepared statements.

As interpolações restantes são estruturais e controladas internamente, como quantidade de placeholders de listas.

Os dois `LIMIT` interpolados foram substituídos por parâmetros preparados.

`multipleStatements` está explicitamente desativado.

## Conexão

Produção agora exige:
- DATABASE_URL MySQL válido;
- usuário e senha;
- `DATABASE_SSL_MODE=verify`;
- TLS com `rejectUnauthorized: true`.

É possível fornecer CA própria por:
`DATABASE_SSL_CA_BASE64`.

## Pool

- connectionLimit: 5;
- waitForConnections: true;
- queueLimit: 100;
- connectTimeout: 10s;
- keepalive habilitado;
- shutdown gracioso fecha o pool.

## Integridade

### Imóveis/fotos
- slug único;
- foto referencia imóvel por FK;
- `ON DELETE CASCADE`;
- storage_path único;
- limite de galeria protegido em transação;
- capa e reordenação usam locks.

### Sessão/identidade
- JTI PK;
- OpenID único onde aplicável;
- hashes de convite e pairing legado únicos;
- convites com aceite/revogação e validade explícitos;
- challenges de uso único;
- criação de sessão usa transação e lock de identidade.

## Achados

### F11-01 — LIMIT interpolado
**Severidade:** Baixa/preventiva
**Status:** Corrigido

Os limites já eram normalizados numericamente, mas agora também usam placeholders preparados.

### F11-02 — multipleStatements implícito
**Severidade:** Preventiva
**Status:** Endurecido

Agora está explicitamente `false`.

### F11-03 — TLS do banco não era exigido por configuração
**Severidade:** Alta em banco remoto
**Status:** Corrigido

Produção falha antes de iniciar se a conexão MySQL não estiver configurada para TLS verificado.

### F11-04 — SQL injection
**Resultado:** Não encontrada

Não foi identificado valor de usuário concatenado diretamente em SQL executável.

## Gate da Fase 11

PASS somente se:
- produção exigir TLS verificado;
- DATABASE_URL inválida falhar;
- custom CA inválida falhar;
- multipleStatements permanecer false;
- valores externos permanecerem parametrizados;
- fotos mantiverem FK/cascade e storage path único;
- operações concorrentes críticas permanecerem transacionais;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 12 — Logs, auditoria e privacidade**

Foco:
- tokens/cookies em logs;
- URLs assinadas;
- dados de leads;
- trilha de auditoria;
- exclusão LGPD;
- minimização e retenção.
