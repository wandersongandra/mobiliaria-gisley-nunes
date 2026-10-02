# Plano técnico — Gisley Nunes Imóveis

## Objetivo

Manter duas experiências separadas, usando o mesmo backend:

- **site público** para catálogo, SEO, contato e páginas institucionais;
- **CRM protegido** para imóveis, fotos, leads, equipe e configurações.

## Origens previstas

- `https://www.gisleynunesimoveis.com.br` — site público;
- `https://painel.gisleynunesimoveis.com.br` — CRM;
- `https://media.gisleynunesimoveis.com.br` — reservado para futuro gateway/Worker autorizado; **não** apontar diretamente para o bucket R2.

## Arquitetura

- Node.js 22 + Express 5;
- EJS para HTML server-rendered;
- Vite para os assets do site público;
- MySQL para dados relacionais;
- Cloudflare R2 para fotos;
- OAuth para autenticação administrativa;
- cookies host-only, `HttpOnly`, `Secure` em produção e `SameSite=Lax`;
- papéis `manager` e `editor`.

## Dados

O MySQL armazena:

- imóveis;
- metadados das fotos;
- usuários autenticados;
- permissões da equipe;
- leads;
- dados institucionais;
- depoimentos.

Os arquivos das fotos ficam no R2. O banco mantém chave do objeto, URL pública, MIME, tamanho, dimensões, capa, ordem e usuário responsável pelo upload.

## Segurança

- catálogo público expõe somente imóveis publicados;
- payload público remove IDs e caminhos internos;
- produção não semeia dados demonstrativos;
- mutações administrativas exigem sessão + mesma origem;
- rotas administrativas podem ser isoladas por `ADMIN_ORIGIN`;
- rate limiting em login, contato e mutações do CRM;
- CSP restrita;
- upload com extensão/MIME permitidos, limite de 12 MB, URL temporária R2 e validação dos bytes reais;
- CodeQL e audit de dependências executados no CI.

## Deploy

Em produção:

1. `DATABASE_URL` é obrigatório;
2. migrações precisam concluir antes do servidor aceitar tráfego;
3. `/_app/health` é liveness;
4. `/_app/ready` é readiness do banco;
5. o container possui `HEALTHCHECK`;
6. SIGTERM/SIGINT fecham o servidor e o pool MySQL de forma graciosa.

## Preview visual

`pnpm build:preview` gera `dist-preview`, usado somente para revisão visual no Cloudflare Workers.

O preview:

- usa dados demonstrativos;
- não representa o backend/CRM real;
- é bloqueado para indexação;
- não deve receber credenciais de produção.

## Comandos

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm build:preview
pnpm start
```

## Gates antes de produção

- CI verde;
- CodeQL verde;
- Docker build verde;
- banco e migrações validados;
- OAuth testado no domínio do painel;
- R2/CORS testados com upload real;
- CRUD de imóvel e galeria testados;
- gestor/editor validados;
- formulário público e fallback de WhatsApp validados;
- 404, sitemap, robots e canonical validados;
- revisão mobile e acessibilidade concluídas.
