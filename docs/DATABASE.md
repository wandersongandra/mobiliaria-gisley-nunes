# Banco de dados

As migrations versionadas criam as tabelas `morada_*`: usuários administrativos,
acessos, convites, challenges OAuth, sessões, imóveis, fotos, site,
depoimentos, auditoria e leads.

## Integridade

- UUIDs são chaves públicas de imóveis, fotos, leads e auditoria.
- Slug de imóvel e caminho de storage são únicos.
- Foto referencia imóvel por chave estrangeira com cascade.
- Status de imóvel e papel da equipe possuem CHECK/trigger compatível com MySQL
  e SQLite.
- `PropertyService` bloqueia a linha do imóvel ao alterar fotos, garantindo no
  máximo uma capa pelo fluxo da aplicação e evitando corrida na ordenação.
- Índices cobrem catálogo, capa/galeria, sessão, retenção e paginação de leads.
- A migration `2026_10_28_000010_enforce_domain_data_integrity` adiciona
  preflight fail-closed e guards no banco para status/tipos de imóveis, status
  e interesse de leads e metadados de fotos R2. Ela preserva os status legados
  de leads que o serviço ainda normaliza (`contacted`, `qualified`, `closed`,
  `lost`) e rejeita valores fora do contrato.

## Operação

Execute somente migrations novas: nunca edite uma migration já aplicada em
ambiente compartilhado. Antes de promoção, valide `php artisan migrate:status`.
O banco de produção deve usar InnoDB, `utf8mb4` e modo estrito.

Leads fechados/perdidos há mais de dois anos são anonimizados pelo scheduler.
O backup MySQL deve ser restaurado primeiro em banco vazio isolado e validado
antes de qualquer troca de aplicação.
