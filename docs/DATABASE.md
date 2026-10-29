# Banco de dados

As migrations versionadas criam as tabelas `morada_*`: usuários administrativos,
acessos, convites, challenges OAuth, sessões, imóveis, fotos, site,
depoimentos, auditoria, leads, histórico de atendimento, perfis profissionais
e modelos de formulários.

## Integridade

- UUIDs são chaves públicas de imóveis, fotos, leads e auditoria.
- Slug de imóvel e caminho de storage são únicos.
- Foto referencia imóvel por chave estrangeira com cascade.
- Status de imóvel e papel da equipe possuem CHECK/trigger compatível com MySQL
  e SQLite.
- `PropertyService` bloqueia a linha do imóvel ao alterar fotos, garantindo no
  máximo uma capa pelo fluxo da aplicação e evitando corrida na ordenação.
- Índices cobrem catálogo, capa/galeria, sessão, retenção e paginação de leads.
- `morada_properties.created_by_open_id` identifica o corretor que cadastrou o
  imóvel; valores nulos em registros legados não concedem edição a corretores.
- `morada_lead_activities` é append-only no fluxo administrativo e possui
  cascade com o lead para evitar histórico órfão.
- Definições de `morada_form_templates` são JSON limitado a 64 KiB e devem ser
  tratadas como dados, nunca como HTML ou código executável.
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
