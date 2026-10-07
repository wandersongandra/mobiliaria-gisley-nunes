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

## Operação

Execute somente migrations novas: nunca edite uma migration já aplicada em
ambiente compartilhado. Antes de promoção, valide `php artisan migrate:status`.
O banco de produção deve usar InnoDB, `utf8mb4` e modo estrito.

Leads fechados/perdidos há mais de dois anos são anonimizados pelo scheduler.
O backup MySQL deve ser restaurado primeiro em banco vazio isolado e validado
antes de qualquer troca de aplicação.
