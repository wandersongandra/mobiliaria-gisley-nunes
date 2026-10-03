# Segurança do backend

## Controles implementados

- OAuth com state de uso único, e-mail verificado, subject imutável por
  provider, e sessões server-side revogáveis vinculadas por FK ao usuário.
- Capabilities centralizadas para manager/editor e rotas administrativas
  deny-by-default.
- CSRF Laravel em mutações; contato público com origem explícita, rate limit e
  honeypot.
- Comparação estrita de esquema, host e porta de origem configurada.
- R2 privado, PUT pré-assinado curto sem overwrite, confirmação por HEAD e
  inspeção real do tipo e das dimensões da imagem antes do registro.
- Headers CSP com nonce, `nosniff`, frame denial, política de referrer e cache
  privado para administração.
- Auditoria crítica transacional para mudanças administrativas sensíveis e log
  append-only no banco.

## Findings da auditoria

| ID | Severidade inicial | Evidência e correção |
| --- | --- | --- |
| SEC-01 | HIGH | A origem comparava somente host e podia aceitar porta não configurada. `RequireSameOrigin` agora compara origem canônica configurada. |
| SEC-02 | HIGH | Largura/altura de upload vinham do cliente. `R2Storage::imageInfo` extrai tipo e dimensões do objeto armazenado e rejeita divergências. |
| SEC-03 | MEDIUM | Não havia endpoints separados de liveness/readiness. Foram incluídos `/health/live` e `/health/ready`, sem detalhes internos. |
| SEC-04 | MEDIUM | Login/logout não deixavam eventos explícitos. Eventos de autenticação agora entram na auditoria sem sessão, token ou cookie. |
| SEC-05 | LOW | `-Indexes` dependia de `mod_negotiation`. A diretiva ficou independente no `.htaccess`. |
| SEC-06 | LOW | HSTS incluía subdomínios sem prova de HTTPS para todos. O header agora não propaga a política a subdomínios. |
| SEC-07 | HIGH | Sessões não tinham FK e e-mail era base de identidade OAuth. `morada_users` e `morada_oauth_identities` usam subject imutável, e sessões novas referenciam ambos por FK. |
| SEC-08 | HIGH | Auditoria sensível era best-effort. `CriticalAuditService` grava mutação e evento na mesma transação e triggers bloqueiam `UPDATE`/`DELETE` no log. |
| SEC-09 | MEDIUM | O framework registrava rotas locais `storage/*` assinadas que não eram usadas. `config/filesystems.php` desativa o serving local e o teste garante sua ausência. |

## Riscos residuais

- Validação ponta a ponta de OAuth, R2, MySQL e Cloudflare requer ambiente
  hospedado com credenciais reais e não foi executada localmente.
- O endpoint legado de catálogo continua disponível temporariamente; o frontend
  usa a v2 paginada. A remoção exige inventário externo de consumidores e aviso
  de sunset.
- Operações que envolvem R2 ainda exigem compensação, pois não existe transação
  distribuída entre MySQL e o bucket.
- Validação real de OAuth, R2, MySQL e Cloudflare continua dependente do
  ambiente autorizado.
- A aplicação é single-tenant; não há isolamento por imobiliária/proprietário.
- Definir retenção legal e backup independente para trilha de auditoria exige
  decisão operacional.
