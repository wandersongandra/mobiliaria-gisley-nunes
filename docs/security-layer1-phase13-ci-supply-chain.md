# Camada 1 — Fase 13: CI/CD e supply chain

Status: **controles de repositório verificados; pinagem imutável de Actions e validação do deploy pendentes**.

## Controles presentes

- CI e CodeQL são executados em `pull_request` e em push para `main`; CodeQL também tem execução semanal.
- Permissões padrão são mínimas (`contents: read`). CodeQL recebe `security-events: write` para publicar resultados. Não foi encontrado `pull_request_target`.
- CI instala com `pnpm install --frozen-lockfile`, executa scanner de segredos, testes, build, preview estático, audit de produção e build de container.
- Dependabot atualiza dependências npm semanalmente e GitHub Actions mensalmente.
- Docker usa build em estágios e usuário sem privilégios; `.dockerignore` exclui `.env`, `.git` e `node_modules`.
- O gate de dependências de produção foi elevado para `pnpm audit --prod --audit-level=moderate` após atualizar a dependência transitiva vulnerável no lockfile.

## Pendências e limites

- As referências `uses:` ainda usam tags versionadas, não SHAs imutáveis. Dependabot reduz o tempo para receber atualizações, mas uma tag mutável não garante reprodutibilidade da ação. Antes de declarar a fase PASS, piná-las em SHAs completos verificados contra os repositórios oficiais e habilitar política de aprovação/allowlist de Actions no GitHub, se disponível.
- Não foi possível verificar configurações da organização/repositório que não estejam versionadas (proteção de branch, exigência de aprovação, secret exposure em PR, environments e regras de deploy).
- Ainda não existe backend hospedado para validar o caminho real entre CI e deploy. O site público atual no Cloudflare não equivale a hospedagem da plataforma/API.
- O relatório da execução CI/CodeQL anterior é evidência para o SHA auditado naquela execução; mudanças deste commit exigem nova execução verde antes do PASS.

## Testes de regressão

`test/workflow-security.test.js` verifica permissões de conteúdo, ausência de `pull_request_target`, audit moderado e presença de Dependabot para npm e Actions.
