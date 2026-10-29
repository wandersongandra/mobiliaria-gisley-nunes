# Auditoria defensiva e plano de validação — backend Gisley Nunes

Data: 29/10/2026. Escopo: Laravel 12, rotas API/web, autenticação e autorização, upload de fotos, resposta de mídia, limite de corpo HTTP, normalização de dados e testes. Base revisada: `ddd514f992e9a8325b39afb940553f414ae737cc`.

## Achados confirmados na revisão de código

| ID | Severidade | Evidência observada na base | Mudança isolada | Risco mitigado |
| --- | --- | --- | --- | --- |
| SEC-12 | Média | `uploadPresigned()` validava capability, arquivo e caminho, mas não exigia vínculo com o presign previamente emitido. | `UploadAuthorization` criptografa claims de caminho, MIME, tamanho, sessão, identidade e expiração (10 min); cabeçalho obrigatório no PUT. | Escrita de arquivo sem autorização específica de emissão, apesar da autorização administrativa prévia. |
| SEC-13 | Média | `LocalMediaStorage::putStream()` usava `stream_copy_to_stream()` sem limite e só comparava o total no final. | Limita cópia a tamanho anunciado + 1 byte; mantém exclusão de arquivo parcial e abertura exclusiva. | Uso desnecessário de disco diante de corpo divergente. |
| SEC-14 | Média | Entrega de mídia confiava no MIME detectado do arquivo para definir `Content-Type`, mas não conferia allowlist no momento da resposta. | `MediaController` e `photoMedia()` retornam 404 para MIME fora da lista de imagens. | Exposição inline de conteúdo ativo em arquivo histórico. |
| SEC-15 | Média | `LimitRequestBody` não exigia tamanho declarado para multipart e não tratava explicitamente TE/CL ambíguos. | Respostas 411/400, mantendo limite geral e gate da borda/PHP. | Ambiguidade de comprimento e bypass de limite de corpo no middleware. |
| SEC-16 | Baixa | Alguns erros de validação/conflito conhecidos não constavam do mapa da API. | Retornos 400/409 com código neutro, sem stack trace. | Falso 500 e sinal incorreto de falha interna. |
| UX-56 | Baixa | `price_label` legado com dígitos puros era devolvido sem formatação pelo serializer público. | Normalização monetária em novos registros e formatação em tempo de saída de dados legados, sem migração destrutiva. | Valor comercial ilegível na interface. |

Severidades referem-se à exposição potencial do código-base, **não** a exploração verificada no ambiente público. Nenhuma tentativa intrusiva contra produção foi executada nesta rodada.

## Controles pré-existentes conservados

- OAuth Google com e-mail verificado, subject do provedor e sessão revogável.
- Rotas administrativas com capacidade por operação, comparação de origem, CSRF e limitação de requisições.
- Arquivos locais privados fora do document root, nome de arquivo controlado, gravação exclusiva, validação de conteúdo/dimensões, sem sobrescrita.
- Audit log transacional, CSP com nonce, `nosniff`, controle de cache e limites de exportação de leads.

## Verificação exigida antes do merge

1. Rodar suíte PHP em CI com MySQL descartável, inclusive testes negativos de upload sem token, token adulterado/expirado, sessão/identidade trocada, mismatch de tamanho, MIME ativo, TE/CL e preço legado em SSR/API.
2. Conferir `npm run build`, verificadores Node, análise estática e segredos.
3. Revisar o diff por regressões de contratos, verificar checks de PR e obter aprovação de Wanderson.
4. Em staging: upload multipart oficial e fluxo `presign` → PUT com headers → registro; publicar e visualizar imagem legítima; validar erros 403/411/400 e ausência de arquivos parciais.
5. Só depois planejar release da versão aprovada, com snapshot/backup e rollback; **esta branch não faz deploy**.

## Riscos residuais / não verificados

- Sem teste de exploração autenticada real em HostGator nesta branch; proteção do reverse proxy/PHP, Cloudflare, ModSecurity, cron, sessão OAuth externa e permissões reais de disco dependem de homologação operacional.
- Sem limites transacionais globais de espaço para uploads órfãos fora do ciclo de cron. O fluxo de dois passos precisa de cron confirmado e métricas de armazenamento.
- Chaves criptográficas (`APP_KEY`), rotação e backup são controles operacionais; tokens emitidos antes de uma troca de chave deixam de ser válidos.
- Aplicação é single-tenant; isolamento multi-imobiliária não faz parte da arquitetura atual.
- A formatação de preço preserva textos comerciais livres; conteúdo previamente redigido de forma incorreta continua exigindo revisão editorial.
