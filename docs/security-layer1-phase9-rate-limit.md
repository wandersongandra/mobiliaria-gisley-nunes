# Camada 1 — Fase 9: Rate limiting e abuso

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Limitar abuso sem criar um novo vetor de indisponibilidade no próprio limiter.

## Limites atuais

- login OAuth: 30 / 10 min / cliente;
- callback OAuth: 30 / 10 min / cliente;
- sonda de sessão: 120 / 5 min / cliente;
- contato público: 8 / 10 min / cliente;
- mutações admin gerais: 300 / 5 min / cliente;
- upload: 120 / 10 min / cliente;
- ações destrutivas: 60 / 10 min / cliente.

## Identificação do cliente

Por padrão:
- usa `socket.remoteAddress`.

`CF-Connecting-IP` só é confiado quando:
- `TRUST_PROXY_MODE=cloudflare`;
- `TRUST_CLIENT_IP_HEADER=true`.

Isso evita spoofing acidental do header quando o origin ainda aceita acesso direto.

## Achados

### F9-01 — Crescimento sem teto rígido do Map de rate limit
**Severidade:** Alta de disponibilidade  
**Status:** Corrigido

A implementação removia entradas expiradas após alta cardinalidade, porém milhares de IPs novos dentro da mesma janela poderiam manter todos os buckets vivos e aumentar continuamente o uso de memória.

**Correção:**
- teto rígido de 10.000 buckets;
- remoção de expirados;
- eviction das entradas mais antigas quando necessário.

### F9-02 — Login e callback OAuth compartilhavam orçamento
**Severidade:** Média-baixa  
**Status:** Corrigido

Callbacks inválidos poderiam consumir o mesmo bucket usado para iniciar login.

**Correção:** namespaces independentes para login e callback.

### F9-03 — Sonda pública de sessão sem limite próprio
**Severidade:** Média-baixa  
**Status:** Corrigido

A rota é anônima por desenho e toca a camada de autenticação/banco.

**Correção:** limite dedicado de 120 / 5 min.

### F9-04 — Upload e ações destrutivas usavam apenas limite admin genérico
**Severidade:** Média  
**Status:** Corrigido

Foram adicionados limites específicos para:
- presign/upload;
- deletes/ações destrutivas.

### F9-05 — Headers de rate limit
**Status:** Implementado

Respostas limitadas passam a expor:
- `RateLimit-Limit`;
- `RateLimit-Remaining`;
- `RateLimit-Reset`;
- `Retry-After` quando bloqueadas.

## Limitação residual conhecida

O limiter é local ao processo.

Em múltiplas réplicas, cada instância teria seu próprio contador. Para escala horizontal, a Camada 2 deve mover os limites críticos para:
- Cloudflare Rate Limiting/WAF; ou
- Redis/serviço compartilhado.

## Gate da Fase 9

PASS somente se:
- requisições até o limite forem aceitas;
- a seguinte receber 429;
- Retry-After estiver presente;
- CF-Connecting-IP não for confiado sem opt-in;
- buckets em memória nunca ultrapassarem o teto;
- login/callback/session/upload/destrutivas tiverem budgets separados;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 10 — Segredos e configuração**

Foco:
- secrets versionados;
- placeholders perigosos;
- histórico;
- logs;
- workflows;
- variáveis obrigatórias;
- frontend bundle;
- fail-closed de produção.
