# Segurança do backend

## Controles implementados

- OAuth com state de uso único, e-mail verificado, subject imutável por
  provider, e sessões server-side revogáveis vinculadas por FK ao usuário.
- Capabilities centralizadas para manager/editor e rotas administrativas
  deny-by-default.
- CSRF Laravel em mutações; contato público com origem explícita, rate limit e
  honeypot.
- Comparação estrita de esquema, host e porta de origem configurada.
- Storage local privado fora do Document Root, PUT autenticado sem overwrite,
  modo de arquivo restrito e inspeção real do tipo e das dimensões da imagem
  antes do registro.
- PUT em duas fases exige autorização criptografada de 10 minutos vinculada a
  arquivo, MIME, tamanho, identidade e sessão. A cópia do stream é limitada ao
  tamanho declarado + 1 byte e remove arquivos parciais em divergências.
- Entrega pública e administrativa de fotos antigas bloqueia tipos MIME fora da
  allowlist de imagens; respostas de mídia têm `nosniff`.
- Requisições multipart sem `Content-Length` válido e cabeçalhos TE/CL
  contraditórios são rejeitados no middleware de tamanho do corpo.
- Headers CSP com nonce, `nosniff`, frame denial, política de referrer e cache
  privado para administração; `style-src` não depende de `unsafe-inline`.
- Exportação de leads com limite dedicado de 20 requisições por 10 minutos por
  IP, além da autenticação, capability e CSRF/origem aplicáveis à superfície
  administrativa.
- Auditoria crítica transacional para mudanças administrativas sensíveis e log
  append-only no banco.

## Findings da auditoria

| ID | Severidade inicial | Evidência e correção |
| --- | --- | --- |
| SEC-01 | HIGH | A origem comparava somente host e podia aceitar porta não configurada. `RequireSameOrigin` agora compara origem canônica configurada. |
| SEC-02 | HIGH | Largura/altura de upload vinham do cliente. `LocalMediaStorage::imageInfo` extrai tipo e dimensões do arquivo local e rejeita divergências. |
| SEC-03 | MEDIUM | Não havia endpoints separados de liveness/readiness. Foram incluídos `/health/live` e `/health/ready`, sem detalhes internos. |
| SEC-04 | MEDIUM | Login/logout não deixavam eventos explícitos. Eventos de autenticação agora entram na auditoria sem sessão, token ou cookie. |
| SEC-05 | LOW | `-Indexes` dependia de `mod_negotiation`. A diretiva ficou independente no `.htaccess`. |
| SEC-06 | LOW | HSTS incluía subdomínios sem prova de HTTPS para todos. O header agora não propaga a política a subdomínios. |
| SEC-07 | HIGH | Sessões não tinham FK e e-mail era base de identidade OAuth. `morada_users` e `morada_oauth_identities` usam subject imutável, e sessões novas referenciam ambos por FK. |
| SEC-08 | HIGH | Auditoria sensível era best-effort. `CriticalAuditService` grava mutação e evento na mesma transação e triggers bloqueiam `UPDATE`/`DELETE` no log. |
| SEC-09 | MEDIUM | O framework registrava rotas locais `storage/*` assinadas que não eram usadas. `config/filesystems.php` desativa o serving local e o teste garante sua ausência. |
| SEC-10 | MEDIUM | O CSP ainda permitia estilos inline sem necessidade observada. `SecurityHeaders` removeu `style-src 'unsafe-inline'` e o teste de renderização impede regressão. Resolvido nesta rodada. |
| SEC-11 | MEDIUM | Exportação de leads concentrava dados pessoais sob o throttle administrativo genérico. A rota agora usa `throttle:export` (20/10 min/IP), mantendo a capability `lead.read`. Resolvido nesta rodada. |
| SEC-12 | MEDIUM | PUT de mídia local permitia a um editor autenticado com capability de mídia gravar um caminho válido sem comprovar autorização de `presign`. Token criptografado com claims vinculados a sessão, caminho, MIME e tamanho agora é obrigatório. |
| SEC-13 | MEDIUM | Gravação de stream copiava bytes indefinidamente antes de detectar divergência com tamanho anunciado. O limite `size + 1` evita escrita sem limite e preserva limpeza de arquivo parcial. |
| SEC-14 | MEDIUM | Arquivos de mídia legados podiam ser entregues inline com MIME ativo apesar da extensão de imagem. Controllers agora exigem MIME efetivo da allowlist. |
| SEC-15 | MEDIUM | Multipart sem comprimento numérico declarado não tinha gate local; TE/CL conflitantes não eram rejeitados explicitamente. O middleware retorna 411 ou 400. |
| SEC-16 | LOW | Quatro erros conhecidos de entrada/conflito eram tratados como falha interna 500. Mapeamento controlado para HTTP 400/409. |
| SEC-17 | LOW | Campos JSON esperados como texto podiam chegar como arrays e disparar conversão implícita ou erro interno. CRM, catálogo e ações administrativas agora rejeitam o tipo inválido com erro 400; o honeypot público mantém resposta neutra. |
| SEC-18 | LOW | O perfil admitia datas do calendário inexistentes, como 31/02, até falhar no banco. Validação com `checkdate` rejeita o dado antes da persistência. |
| SEC-19 | MEDIUM | A auditoria ocultava nomes fixos de segredos, mas variações como `sessionJti` e `awsSecretAccessKey` não estavam na lista. A sanitização agora reconhece componentes sensíveis de nomes compostos, preservando apenas a flag `tokenStoredAsHash`. |

## Riscos residuais

- Validação ponta a ponta de OAuth, MySQL, HostGator e permissões do diretório
  de mídia requer ambiente hospedado e não foi executada localmente.
- O endpoint legado de catálogo continua disponível temporariamente; o frontend
  usa a v2 paginada. A remoção exige inventário externo de consumidores e aviso
  de sunset.
- A gravação do arquivo e o registro MySQL não formam uma transação distribuída;
  a compensação remove o arquivo quando o registro falha.
- Objetos antigos do R2 ainda exigem migração física autorizada para `MEDIA_ROOT`;
  o código não a executa silenciosamente.
- A aplicação é single-tenant; não há isolamento por imobiliária/proprietário.
- Definir retenção legal e backup independente para trilha de auditoria exige
  decisão operacional.
- Uploads locais incompletos podem permanecer até o job de limpeza de órfãos;
  confirmar o cron da hospedagem e a retenção antes de operar em escala.
- As mudanças SEC-12 a SEC-16 requerem execução de CI, revisão de PR e
  homologação separada antes de qualquer implantação em produção.
## Operação e release

O checklist de configuração externa e evidências de produção está em [SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md).
