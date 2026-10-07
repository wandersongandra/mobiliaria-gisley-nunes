# Security hardening — 2026-10-07

Branch de revisão: `security/hardening-2026-10-07`

Base: `migration/laravel-backend-2026-10-02` @ `2068204c6f438588686e99bcb676f9a91008c3b5`

## Regras desta rodada

- Nenhum deploy em produção nesta branch.
- Nenhum merge em `main`.
- Nenhum segredo ou credencial é adicionado ao repositório.
- O fluxo OAuth/ModSecurity em investigação pela HostGator não será “contornado” desativando controles de aplicação.
- Mudanças devem preservar o backend Laravel, o painel atual e o upload privado no R2.
- Cada fase precisa de testes/contratos proporcionais ao risco alterado.

## Plano faseado

### Fase 1 — Perímetro HTTP e isolamento do painel

Objetivo: reduzir host-header abuse, clickjacking, navegação cross-origin e exposição acidental do painel em hostnames não autorizados.

Mudanças planejadas:
- alinhar os headers Laravel ao baseline mais rígido já usado no preview Node;
- validar hosts conhecidos em produção;
- restringir a superfície administrativa ao `ADMIN_ORIGIN`;
- marcar painel/autenticação como `noindex` e `no-store`;
- adicionar testes de contrato.

### Fase 2 — Sessão e ciclo de acesso administrativo

Objetivo: reduzir persistência de sessões inválidas e endurecer o cookie da sessão.

Mudanças planejadas:
- cookie de sessão com prefixo `__Host-` por padrão;
- validação fail-closed dessa configuração no `app:production-check`;
- revogação persistente de sessões inválidas, expiradas por inatividade ou associadas a identidade/acesso removido;
- testes de revogação.

### Fase 3 — Limites de requisição e abuso de API

Objetivo: reduzir DoS de camada de aplicação, payloads excessivos e scraping agressivo sem prejudicar uso normal.

Mudanças planejadas:
- limite explícito de corpo para mutações;
- rate limit dedicado para APIs públicas;
- contrato 413 para payload excessivo;
- testes de rota e limites.

### Fase 4 — Higiene do ciclo OAuth, convites e pareamento

Objetivo: evitar acúmulo indefinido de desafios/tokens temporários e manter o fluxo one-time.

Mudanças planejadas:
- limpeza oportunística de desafios OAuth e pareamentos expirados;
- preservação de hash, TTL e consumo atômico;
- testes de expiração/limpeza.

### Fase 5 — Fronteira de mídia/R2

Objetivo: tornar caminhos de objeto e tipos de upload fail-closed mesmo se um controller futuro esquecer uma validação.

Mudanças planejadas:
- validação estrutural mais estrita de chaves R2;
- bloqueio de caracteres de controle, barras invertidas, segmentos vazios e traversal;
- allowlist de MIME também dentro do serviço de storage;
- testes de upload e chaves.

### Fase 6 — Auditoria sem vazamento de segredos

Objetivo: impedir que detalhes de auditoria armazenem tokens, cookies, senhas ou material equivalente por engano.

Mudanças planejadas:
- sanitização recursiva de detalhes;
- redaction por nome de chave sensível;
- limite de profundidade/tamanho;
- testes de integridade e redaction.

### Fase 7 — Supply chain, CI e gates de produção

Objetivo: reduzir risco de dependências, token do GitHub persistido no checkout e configurações inseguras que passariam pelo deploy.

Mudanças planejadas:
- Dependabot para Composer;
- checkout sem persistir credencial nos workflows onde isso não é necessário;
- checks adicionais em `app:production-check`;
- expansão segura do scanner de segredos;
- execução de todos os gates.

### Fase 8 — Verificação final

Objetivo: entregar a branch pronta apenas para revisão.

Gates esperados:
- PHPUnit/Feature;
- MySQL CI;
- PHPStan/Larastan;
- Pint;
- Composer audit;
- Node tests;
- Playwright;
- secret scan;
- pnpm audit;
- CodeQL;
- production build.

## Status

- [x] Plano criado
- [ ] Fase 1
- [ ] Fase 2
- [ ] Fase 3
- [ ] Fase 4
- [ ] Fase 5
- [ ] Fase 6
- [ ] Fase 7
- [ ] Fase 8
