# Camada 1 — Fase 13: CI/CD e supply chain

Status: **controles versionados implementados; validação do deploy pendente**.

## Controles presentes

- CI e CodeQL são executados em `pull_request` e em push para `main`; CodeQL também tem execução semanal.
- Permissões padrão são mínimas (`contents: read`). CodeQL recebe `security-events: write` para publicar resultados. Não foi encontrado `pull_request_target`.
- CI instala com `pnpm install --frozen-lockfile`, executa scanner de segredos, testes, build, preview estático, audit de produção e build de container.
- Dependabot atualiza dependências npm semanalmente e GitHub Actions mensalmente.
- Todas as referências `uses:` foram fixadas nos SHAs completos que o próprio runner registrou ao resolver as tags aprovadas; os comentários `# vN` preservam a pista de versão para Dependabot.
- Docker usa build em estágios e usuário sem privilégios; `.dockerignore` exclui `.env`, `.git` e `node_modules`.
- O gate de dependências de produção foi elevado para `pnpm audit --prod --audit-level=moderate` após atualizar a dependência transitiva vulnerável no lockfile.

## Pendências e limites

- Não foi possível verificar configurações da organização/repositório que não estejam versionadas (proteção de branch, exigência de aprovação, secret exposure em PR, environments e regras de deploy).
- Ainda não existe backend hospedado para validar o caminho real entre CI e deploy. O site público atual no Cloudflare não equivale a hospedagem da plataforma/API.
- CI (incluindo MySQL, scanner histórico de segredos, audit moderado e Docker) e CodeQL passaram no commit `f379f69e2dd88558fc72bf55560b762edaeeb44f`. A nova pinagem exige repetição dos workflows antes do PASS final.

## Testes de regressão

`test/workflow-security.test.js` verifica permissões de conteúdo, ausência de `pull_request_target`, pinagem por SHA completo, audit moderado e presença de Dependabot para npm e Actions.
