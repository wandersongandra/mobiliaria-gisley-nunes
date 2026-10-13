# Plano de qualidade full-stack — Gisley Nunes Imóveis (13/10/2026)

## Regras
- Branch de auditoria isolada; abrir **PR sem merge e sem deploy**.
- Preservar identidade visual, conteúdo legítimo, imóveis e fotografias. Nada de dados inventados.
- Laravel/Blade é a fonte oficial de produção, Vite produz `public/assets/*`, `admin/*` espelha `public/admin/*`; o preview EJS não substitui a aplicação.
- Prioridades: P0 segurança e perda de dados; P1 navegação, mobile, conversão e consistência; P2 acabamento e performance.
- Nenhuma alegação de Lighthouse, dispositivo físico ou produção sem evidência.

## Fase 1 — Front-end público, mobile/desktop
1. Corrigir competição entre requests dos filtros/paginação; impedir resposta antiga sobrescrever resultado atual.
2. Restaurar navegação de histórico do catálogo (voltar/avançar), respeitar filtros salvos em URL, evitar requests desnecessários e preservar resultados SSR durante hidratação.
3. Tratar ausência de imagem de anúncio sem URL vazia; evitar regredir interface e acessibilidade.
4. Melhorar galeria: carregamento e erro de imagem, indicadores acessíveis, gestos touch, reduzido movimento e prevenção de estado ultrapassado.
5. Conferir formulários (envio duplicado, anúncio de erros, dados pessoais em URL), navegação teclado/foco e breakpoints.
6. Cobrir filtros, histórico, concorrência e páginas estreitas com Playwright.

## Fase 2 — Admin/CRM mobile e desktop
1. Corrigir resposta fora de ordem em carregamento de lista de imóveis/leads.
2. Não bloquear busca digitada enquanto rede carrega; corrigir carregamento e recuperação de erros.
3. Melhorar controles, diálogos, teclado, upload de fotos e mensagens orientadas à operação.
4. Sincronizar código e artefatos públicos do CRM.
5. Testar fluxo de equipe, cadastro, papéis e sessão sem reduzir controles do backend.

## Fase 3 — Backend Laravel e segurança
1. Revisar validação das rotas públicas/admin, limites de recursos, invalidação de cache e exposição de dados.
2. Tratar entradas malformadas de filtros de página de forma robusta e consistente com a API.
3. Reforçar contratos de limites com testes PHP (não depender apenas de validação client-side).
4. Não alterar identidade Google, permissões ou deploy sem evidência e testes.
5. Revalidar CI PHP/Laravel, testes browser, build, CodeQL e audits; impedir merge se algum gate falhar.

## Fase 4 — Entrega
- Reconstruir os assets via pipeline Vite auditável; evitar editar bundle manualmente.
- Abrir PR com mudanças, evidência dos testes e pendências; **somente o usuário aprova**.
- Publicação HostGator não é automática pela branch main: preservar gates de deploy da branch Laravel e SHA aprovado.

## Itens dependentes de verificação externa
- Core Web Vitals reais (LCP/CLS/INP) no tráfego e teste em iPhone/Android físicos.
- OAuth real, R2 real, infraestrutura WAF, SSH e configuração Google Cloud.
- Mudanças em fotos/dados de anúncios sob controle do proprietário.
