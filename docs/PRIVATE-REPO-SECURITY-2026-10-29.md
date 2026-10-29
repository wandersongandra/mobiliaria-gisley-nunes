# Compatibilidade de segurança por visibilidade — Gisley Nunes

Este registro acompanha a alternância de visibilidade do repositório em 29/10/2026. A configuração efetiva deve sempre ser verificada no GitHub antes de definir gates.

## Estado verificado
- Durante a auditoria, o repositório foi observado como privado e depois como público. A última consulta confirmou **público**; essa condição pode mudar.
- A `main` e a branch de release continuam sem proteção. Quando o repositório esteve privado, a API de rulesets retornou HTTP 403 com a exigência de GitHub Pro ou repositório público.
- Proteção da branch de release e regras do ambiente `production` precisam de verificação no painel.
- CodeQL concluiu com sucesso durante a mudança. Dependency Review chegou a falhar com aviso de falta de suporte no estado privado; ao voltar a público, passou novamente. O workflow agora resolve a visibilidade pela API e prevê auditoria Composer/pnpm no estado privado.
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
