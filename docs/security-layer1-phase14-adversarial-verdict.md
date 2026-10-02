# Camada 1 — Fase 14: rodada adversarial e veredito

Data da revisão: 2026-10-02  
Escopo: repositório e testes automatizados da branch de auditoria. O backend ainda não está hospedado.

## Rodada coberta por automação

A suíte existente e os testes adicionados cobrem acesso sem sessão, papéis e capacidades, adulteração de payload/role, métodos HTTP inesperados, CSRF e origem, sessão/JWT/state, validação e tamanho de payload, XSS/EJS, upload e assinatura de mídia, rate limits, headers, queries e políticas de CI. A nova cobertura da Fase 12 injeta marcadores sensíveis em mensagens de erro e verifica que não aparecem nos logs.

## Resultado reproduzido nesta revisão

- `node --test`: **174 passaram, 0 falharam, 1 ignorado** (teste MySQL requer serviço local).
- `pnpm audit --prod --audit-level=moderate`: **passou sem vulnerabilidades conhecidas** com `ip-address@10.7.2`.
- `vite build`: **passou**.
- `scripts/build-pages-preview.mjs`: **passou; 12 páginas geradas**.
- Scanner histórico de segredos: **passou na CI do GitHub**. A execução local foi interrompida porque o clone filtrado buscava blobs de todo o histórico.
- CI (ambos os jobs, incluindo MySQL, audit moderado e build Docker) e CodeQL: **PASS** no commit `f379f69e2dd88558fc72bf55560b762edaeeb44f`.
- A pinagem das GitHub Actions foi adicionada depois desse commit e precisa de uma execução verde no novo HEAD. O teste MySQL local foi ignorado, mas passou na CI com MySQL 8.4.

## Veredito

**NO-GO para declarar a Camada 1 concluída ou liberar produção.**

Os controles de código das Fases 1–11 têm implementação e evidências versionadas nos relatórios existentes; a Fase 12 recebeu sanitização dos logs e testes; a Fase 13 tem gates, mas ainda usa tags mutáveis para GitHub Actions. A rodada adversarial reproduzida localmente passou nos testes disponíveis, mas não equivale ao gate completo do commit nem à operação hospedada.

## Bloqueios explícitos para PASS final

1. Hospedar o backend/plataforma e validar OAuth ponta a ponta, cookies, callback, logs e exclusão de leads no ambiente real.
2. Executar novamente CI, CodeQL, MySQL, scanner de segredos e build de container no HEAD com pinagem de Actions.
3. Conferir regras de branch, ambientes, secrets e aprovações no GitHub.
4. Definir prazo de retenção/expurgo para leads e trilha de auditoria com a política operacional e jurídica responsável.
5. Fazer teste externo de Cloudflare/proxy e abuso com backend hospedado, incluindo IP confiável, host e origem encaminhados.

Até que esses gates terminem, as fases com evidência de código podem ser tratadas como **implementadas/validadas parcialmente**, mas o status agregado permanece **NO-GO**.
