# Segurança do backend

## Controles implementados

- OAuth com state de uso único, e-mail verificado e sessão server-side
  revogável.
- Capabilities centralizadas para manager/editor e rotas administrativas
  deny-by-default.
- CSRF Laravel em mutações; contato público com origem explícita, rate limit e
  honeypot.
- Comparação estrita de esquema, host e porta de origem configurada.
- R2 privado, PUT pré-assinado curto sem overwrite, confirmação por HEAD e
  inspeção real do tipo e das dimensões da imagem antes do registro.
- Headers CSP com nonce, `nosniff`, frame denial, política de referrer e cache
  privado para administração.
- Auditoria de ações administrativas, incluindo login, logout e logout global.

## Findings da auditoria

| ID | Severidade inicial | Evidência e correção |
| --- | --- | --- |
| SEC-01 | HIGH | A origem comparava somente host e podia aceitar porta não configurada. `RequireSameOrigin` agora compara origem canônica configurada. |
| SEC-02 | HIGH | Largura/altura de upload vinham do cliente. `R2Storage::imageInfo` extrai tipo e dimensões do objeto armazenado e rejeita divergências. |
| SEC-03 | MEDIUM | Não havia endpoints separados de liveness/readiness. Foram incluídos `/health/live` e `/health/ready`, sem detalhes internos. |
| SEC-04 | MEDIUM | Login/logout não deixavam eventos explícitos. Eventos de autenticação agora entram na auditoria sem sessão, token ou cookie. |
| SEC-05 | LOW | `-Indexes` dependia de `mod_negotiation`. A diretiva ficou independente no `.htaccess`. |
| SEC-06 | LOW | HSTS incluía subdomínios sem prova de HTTPS para todos. O header agora não propaga a política a subdomínios. |

## Riscos residuais

- Validação ponta a ponta de OAuth, R2, MySQL e Cloudflare requer ambiente
  hospedado com credenciais reais e não foi executada localmente.
- A API pública de catálogo preserva o contrato atual de lista completa;
  paginação pública requer mudança coordenada no consumidor JavaScript.
- Auditorias de CRUD são gravadas após a mutação e seguem o comportamento de
  melhor esforço do controller. Torná-las atômicas exige desenhar uma unidade de
  trabalho por caso de uso para não transformar uma falha de log em repetição de
  operação pelo cliente.
- Sessões e usuários usam o mesmo `open_id`, mas não possuem foreign key entre
  si para manter compatibilidade com o bootstrap OAuth. Criar essa FK requer
  inspeção e correção de dados no MySQL hospedado antes da migration.
- A aplicação é single-tenant; não há isolamento por imobiliária/proprietário.
- Definir retenção legal e backup independente para trilha de auditoria exige
  decisão operacional.
