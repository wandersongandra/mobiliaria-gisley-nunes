# Arquitetura do backend

## Runtime

O backend é Laravel 12 em PHP 8.2 ou superior, preparado para Apache/PHP-FPM e
MySQL na HostGator. Node.js é usado somente pelos fluxos locais e de CI do
frontend; não é requisito do runtime PHP.

## Fluxo de dependências

```text
routes/web.php
  -> middleware (SecurityHeaders, RequireSameOrigin, RequireAdmin, RequireCapability)
  -> controllers
  -> AdminAccessService | PropertyService | CrmService | R2Storage
  -> MySQL / Cloudflare R2
```

O projeto usa Query Builder deliberadamente. Não há Models Eloquent,
repositories, jobs, listeners ou filas no backend Laravel atual. A validação de
domínio está nos serviços e as validações de filtros HTTP ficam nos controllers.
Não introduzir Eloquent apenas por convenção: ele não reduz o acoplamento atual.

## Superfícies

- Público: páginas Blade, catálogo, site, contato, descoberta e `/media/*`.
- Identidade: OAuth, sessões server-side e convites.
- Administrativo: imóveis, fotos, CRM, equipe e auditoria, protegidos por
  sessão, origem, CSRF e capability.
- Operação: `/health/live`, `/health/ready` e o alias compatível
  `/_app/health`.

Cada resposta recebe `X-Request-ID`. Um identificador seguro enviado pelo
cliente é preservado; qualquer outro é substituído e entra no contexto dos logs.

## Limites conhecidos

`PropertyService` e `CrmService` concentram regras de domínio e acesso ao banco.
Manter essa organização enquanto o produto tiver este tamanho; extrair actions
apenas quando um fluxo passar a ser usado por mais de uma interface. O sistema é
single-tenant por definição desta versão.
