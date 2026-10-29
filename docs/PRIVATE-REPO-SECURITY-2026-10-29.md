# Segurança do repositório privado — Gisley Nunes

Este registro acompanha a migração do repositório para visibilidade privada em 29/10/2026.

## Estado verificado
- Repositório privado, acessível somente a colaboradores autorizados.
- A branch `main` segue sem proteção; a API de rulesets retornou HTTP 403 com a exigência de GitHub Pro ou repositório público.
- Proteção da branch de release e regras do ambiente `production` precisam de verificação no painel.
- CodeQL/code scanning e Dependency Review, antes disponíveis no repositório público, podem exigir licenciamento GitHub Code Security em um repositório privado.
- A mudança de visibilidade não comprova que os workflows anteriores continuam operacionais. É obrigatório validar novas execuções.

## Regras de release
1. Não publicar com workflows ausentes, ignorados ou com falha.
2. Referenciar o SHA completo da branch `migration/laravel-backend-2026-10-02`.
3. Validar Laravel CI/MySQL, quality gates, auditoria de dependências, segurança e pacote de produção.
4. Só iniciar o workflow de deploy pela `main`, após revisão humana do diff e confirmação dos gates.
5. Sem merge direto ou deploy automático por agentes; o proprietário revisa e executa o merge.
6. Qualquer troca de scanner licenciável por alternativa aberta exige novos testes e registro da cobertura residual.

## Configuração do GitHub
Em repositório privado, os recursos variam conforme o plano. Conferir antes de criar requisitos de check que não poderão ser satisfeitos:
- Branch rulesets / protected branches.
- GitHub Code Security e Secret Protection.
- Environment `production` e required reviewers.
- Dependabot alerts e auditorias Composer/pnpm.

O GitHub não permite que o autor aprove sua própria PR. Enquanto a conta for a única autora e revisora, não exigir uma aprovação formal que produza bloqueio permanente. O responsável permanece com o controle manual de merge e deploy.
