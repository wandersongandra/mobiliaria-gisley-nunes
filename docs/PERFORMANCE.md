# Performance

## Medidas aplicadas

- catálogo v2 paginado, com limites de página e filtros no servidor;
- imagens abaixo da dobra usam `loading="lazy"` e `decoding="async"`;
- hero e imagem principal do imóvel usam `fetchpriority="high"`;
- CSS respeita `prefers-reduced-motion`;
- dependências de produção do frontend passaram `pnpm audit` sem findings;
- build Vite e preview estático são verificáveis no CI.

## Riscos observados

Os artefatos públicos usam imagens remotas e o hero tem dimensões controladas
por CSS. Core Web Vitals reais (LCP, CLS e INP) não foram medidos contra a
origem pública enquanto DNS/SSL estão em propagação; isso permanece uma etapa
operacional, não um PASS inventado.

Antes da ativação pública, medir desktop e mobile com imagens reais/R2 e
confirmar que a estratégia de URLs assinadas não cria cache indevido.
