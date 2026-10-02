# Camada 1 — Fase 12: logs, trilha de auditoria e privacidade

Status: **implementação e testes de código aprovados; validação operacional em produção pendente**.

## Controles verificados no código

- Erros de API, OAuth, auditoria, limpeza de arquivos e banco não registram mensagens ou stack traces arbitrários. O logger em `server/operational-logging.js` emite somente eventos enumerados e códigos técnicos permitidos; os demais erros viram `UNCLASSIFIED`.
- O lockfile fixa `ip-address@10.7.2`, dependência transitiva corrigida e madura o bastante para passar a política local de idade mínima; a versão mais nova disponível no momento foi barrada pelo cooldown local.
- A resposta pública de erro continua usando códigos HTTP opacos, sem expor detalhes internos.
- A exclusão de lead exige a capacidade `lead.erase` e limite para operações destrutivas. A auditoria dessa ação registra motivo operacional fixo, sem copiar a mensagem do lead.
- A visualização de auditoria omite detalhes internos e identificadores de identidade do provedor.
- Testes adversariais incluem marcadores de JWT, cookie, código OAuth, URL assinada, conteúdo de lead e stack trace, além de injeção no nome do evento.

## Retenção e limites de evidência

- O sistema não define um prazo de retenção para leads ou trilha de auditoria. Esse prazo depende de política operacional e validação jurídica; não foi inventado nesta implementação.
- Não há backend hospedado neste momento. Portanto, não foi possível inspecionar logs reais do provedor, validar retenção/expurgo em produção ou observar pedidos de exclusão ponta a ponta.
- Os testes do repositório validam geração e exposição de logs no código, não a configuração de retenção do futuro host.

## Evidência desta revisão

- `test/operational-logging.test.js`: prova de que erros não classificados não reproduzem campos sensíveis.
- `test/errors.test.js`: mantém testes de respostas opacas para erros e payloads malformados.
- CI completa e CodeQL passaram no commit `8c9a7fcdbf8e6657ff23072d26637325f151943a`, incluindo scanner de segredos, MySQL, testes, build, audit moderado, Docker e Actions pinadas.
- A fase só pode receber PASS operacional depois de configurar a hospedagem da plataforma, revisar o destino/retenção de logs e confirmar o fluxo de exclusão no ambiente hospedado.
