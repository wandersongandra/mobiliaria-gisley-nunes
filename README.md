# Gisley Nunes Imóveis

Plataforma imobiliária com **site público**, **catálogo de imóveis** e **CRM administrativo**, projetada para centralizar publicação de imóveis, fotos, contatos, equipe e dados institucionais.

> Estado atual: desenvolvimento e homologação. A `main` não deve ser tratada como produção até a conclusão dos gates de segurança, banco, OAuth, R2 e revisão jurídica.

## Visão geral

A aplicação separa três responsabilidades:

```text
Site público
  ├─ catálogo e páginas institucionais
  ├─ detalhes de imóveis
  └─ formulários de contato
          │
          ▼
       Backend
     Express / Node
       ├─ MySQL
       │   ├─ imóveis
       │   ├─ usuários e permissões
       │   ├─ leads
       │   ├─ configurações
       │   └─ auditoria
       │
       └─ Cloudflare R2
           └─ fotos dos imóveis

Painel administrativo
  ├─ imóveis e galeria
  ├─ contatos
  ├─ equipe
  ├─ configurações
  └─ atividade/auditoria
```

## Stack

- Node.js 22
- Express 5
- EJS
- Vite
- MySQL
- Cloudflare R2
- OAuth
- `jose` para sessão/JWT
- pnpm
- Docker
- GitHub Actions + CodeQL

## Estrutura principal

```text
admin/          painel administrativo
docs/           documentação técnica e auditorias
public/         assets públicos
scripts/        build, preview e verificações
server/         backend, autenticação, banco e segurança
src/            JavaScript e estilos do site público
test/           testes automatizados
views/          templates EJS
```

## Desenvolvimento local

### Requisitos

- Node.js 22+
- Corepack
- pnpm 10.4.1
- MySQL para testar o CRM completo

### Instalação

```bash
corepack enable
pnpm install --frozen-lockfile
```

### Ambiente

Use `.env.example` como referência. Não versione valores reais.

Principais grupos de configuração:

- `PUBLIC_ORIGIN` e `ADMIN_ORIGIN`
- `DATABASE_URL` e TLS do MySQL
- `GISELY_SESSION_SECRET`
- identidades administrativas OAuth
- Cloudflare R2
- configuração do provider OAuth

### Execução

```bash
pnpm dev
```

## Validação

Antes de abrir PR ou promover uma versão:

```bash
pnpm test
pnpm build
pnpm security:secrets
pnpm audit --prod --audit-level=high
```

O CI também valida o build do container.

## Perfis e permissões

### Gestor

Pode administrar:

- imóveis;
- galeria de fotos;
- contatos;
- equipe;
- dados institucionais;
- depoimentos;
- trilha de atividade;
- exclusão de dados pessoais de contatos quando aplicável.

### Corretor / Editor

Pode operar imóveis, fotos e atendimento dentro das permissões definidas pelo backend, sem administrar equipe ou configurações sensíveis.

A autorização é decidida no servidor. Botões escondidos na interface não são tratados como controle de acesso.

## Segurança

A arquitetura inclui, entre outros controles:

- sessão administrativa com validação server-side;
- cookies `HttpOnly`, `Secure` em produção e escopo restrito;
- verificação de origem nas mutações;
- rate limiting;
- Content Security Policy;
- HSTS em produção;
- proteção contra framing;
- validação de entradas;
- catálogo público limitado a imóveis publicados;
- payloads públicos sem identificadores/caminhos internos desnecessários;
- uploads com URL temporária, MIME assinado e validação dos bytes reais;
- bucket R2 privado;
- trilha de auditoria;
- CodeQL e gates de CI.

As auditorias são registradas em `docs/`. Um resultado de teste verde não substitui revisão de produção, infraestrutura ou pentest quando o risco justificar.

## Fotos e Cloudflare R2

O banco guarda metadados; os arquivos ficam no R2.

Fluxo resumido:

1. usuário autorizado seleciona a imagem;
2. backend valida o pedido de upload;
3. navegador recebe URL temporária;
4. arquivo é enviado diretamente ao R2;
5. backend verifica o objeto e o formato real;
6. metadados são persistidos no MySQL;
7. leitura pública ocorre apenas conforme as regras da aplicação.

Detalhes: `docs/cloudflare-r2-admin.md`.

## Privacidade e documentos legais

O site possui páginas próprias de:

- `/termos` — Termos de Uso;
- `/privacidade` — Política de Privacidade.

Os textos foram escritos para refletir o funcionamento técnico atual da aplicação e devem receber revisão jurídica antes da publicação comercial definitiva, especialmente após confirmação de dados cadastrais e profissionais da operação.

## Preview de design

```bash
pnpm build:preview
```

Gera `dist-preview` para revisão visual.

O preview:

- usa dados demonstrativos;
- não representa o backend real;
- deve permanecer `noindex`;
- não recebe credenciais de produção.

## Deploy

A produção deve falhar fechada quando uma configuração crítica estiver ausente.

Antes da publicação final, validar no mínimo:

- banco e migrações;
- OAuth real;
- sessão/revogação;
- DNS do site e painel;
- R2 e CORS;
- CRUD de imóveis;
- upload/remoção/reordenação de fotos;
- permissões Gestor/Editor;
- formulário e CRM;
- backup e restore;
- sitemap, canonical e 404;
- mobile e acessibilidade;
- Termos e Privacidade;
- CI, CodeQL e scan de secrets.

## Documentação

- `plan.md` — arquitetura e gates
- `docs/cloudflare-r2-admin.md` — R2 e painel
- `docs/security-layer1-phase1-surface.md` — superfície de ataque
- `docs/legal-review-checklist.md` — pendências para revisão jurídica

## Licença e uso

Este repositório é privado ao projeto Gisley Nunes Imóveis. Código, identidade visual, conteúdo e ativos não devem ser reutilizados ou redistribuídos sem autorização dos respectivos titulares.
