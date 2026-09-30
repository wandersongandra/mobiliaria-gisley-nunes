# Gisley Nunes Imóveis

Site institucional e catálogo imobiliário com painel administrativo, construído com Express, EJS, Vite e MySQL.

## Desenvolvimento

```bash
corepack enable
pnpm install
pnpm dev
```

## Validação

```bash
pnpm test
pnpm build
```

## Variáveis de ambiente

Copie `.env.example` para o ambiente da aplicação e configure os valores reais no provedor de deploy. Nunca versione segredos. Em produção, defina `PUBLIC_ORIGIN` com a origem HTTPS canônica do site e use um `MORADA_SESSION_SECRET` aleatório com pelo menos 32 caracteres.

## CRM e permissões

O painel em `/admin` concentra imóveis, fotos, contatos recebidos pelo site, dados institucionais, depoimentos e equipe.

- **Gestor:** acesso completo; gerencia equipe, dados do site, depoimentos, imóveis, fotos e contatos.
- **Corretor / Editor:** cadastra e edita imóveis e fotos e acompanha contatos, sem poder administrar equipe ou dados institucionais.
- Os e-mails definidos em `MORADA_ADMIN_EMAILS` são gestores principais e não podem ser removidos/rebaixados pelo painel.
- Novos acessos são cadastrados pelo gestor usando o e-mail que a pessoa utilizará no login.

## Segurança

- Sessão administrativa assinada, com expiração e cookies `HttpOnly`, `Secure` em produção e `SameSite=Lax`.
- Rotas administrativas protegidas por autenticação, verificação de mesma origem e limitação de requisições.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e proteção contra framing.
- Imóveis em rascunho ou arquivados não são expostos por slug na área pública.
- Uploads aceitam apenas formatos de imagem e tamanho permitido.
- Formulários públicos são validados no servidor e armazenados como contatos no banco.

## Preview de design

`pnpm build:preview` gera uma versão estática em `dist-preview` para revisão visual no Cloudflare Workers. Esse preview não substitui o backend do CRM e não deve ser usado como produção.

## Deploy

O `Dockerfile` usa build em múltiplos estágios e executa o processo final como usuário não-root. O banco é migrado de forma idempotente na inicialização.
