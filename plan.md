# Plano — Gisley Nunes Imóveis

## Objetivo
Entregar uma experiência pública premium para a Gisley Nunes Imóveis, em Belo Horizonte, e um painel administrativo protegido para cadastrar imóveis, gerenciar fotos e publicar o catálogo sem editar código.

## Decisões
- **Arquitetura:** frontend Vite servido por Express, com API JSON, banco MySQL gerenciado e object storage para fotos. A sessão administrativa usa Manus OAuth e o cookie `webdev_app_session` compatível com Preview.
- **Acesso admin:** whitelist por e-mail em `MORADA_ADMIN_EMAILS`; nenhuma senha própria é criada. Usuários autenticados fora da whitelist recebem 403.
- **Entrega:** o container roda `server/index.js`, executa migração idempotente na inicialização e serve o build Vite da pasta `dist/`.
- **Dados:** imóveis, fotos e usuários autorizados têm tabelas próprias; o catálogo público lista apenas imóveis publicados.
- **SEO:** conteúdo principal presente no HTML inicial, metadados descritivos, Open Graph, canonical relativo configurável e `public/robots.txt`, `public/sitemap.xml` e `public/manus-routes.json`.
- **Cache:** assets com hash do Vite recebem cache longo; HTML e respostas de API são revalidados. Uploads ficam fora do Git em armazenamento persistente.
- **Rotas atuais:** `/`, `/imoveis`, `/admin`, `/api/auth/*`, `/api/admin/*`, `/api/properties` e `/_app/health`.

## Estrutura
- `index.html`: shell semântico e metadados.
- `src/main.js`: experiência pública, filtros, menu mobile e formulário.
- `src/styles.css`: sistema visual responsivo.
- `src/data.js`: imóveis, depoimentos e dados de contato demonstrativos.
- `public/images/`: logo e imagens de destaque.
- `admin/`: shell do painel e editor de imóveis.
- `server/`: Express, OAuth, autorização, API de imóveis/fotos e migração.
- `Dockerfile`: build e runtime do container publicado.

## Verificação
Inspecionar a fonte, executar `npm run build`, iniciar o serviço no listener declarado, verificar `GET /`, `GET /manus-routes.json` e `GET /_app/health` com HTTP 200, conferir a migração idempotente e garantir que endpoints admin rejeitam chamadas sem sessão autorizada. O fluxo OAuth/upload real será validado quando o primeiro administrador configurar o e-mail autorizado.
