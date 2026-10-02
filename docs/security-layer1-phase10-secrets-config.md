# Camada 1 — Fase 10: Segredos e configuração

Data da revisão: 2026-10-01
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Impedir que credenciais, tokens ou configuração incompleta cheguem ao repositório ou permitam produção parcialmente insegura.

## Controles revisados

- `.gitignore` exclui `.env` e variantes;
- `.dockerignore` exclui `.env`, Git e workflows;
- nenhum segredo é necessário no bundle do frontend;
- Docker runtime recebe somente artefatos necessários;
- produção valida origens, OAuth, banco, identidade bootstrap e segredo de sessão;
- produção agora exige R2 completo e válido.

## Secret scan

Foi criado:
`pnpm security:secrets`

O scanner verifica:
- arquivos rastreados atuais;
- diffs de todo o histórico Git.

Padrões cobertos incluem:
- chaves privadas PEM;
- GitHub tokens;
- OpenAI-style keys;
- AWS-style access keys;
- valores reais de variáveis sensíveis;
- DATABASE_URL com credencial.

O CI falha quando encontra um padrão não reconhecido como placeholder.

## Achados

### F10-01 — Produção podia subir sem storage
**Severidade:** Alta operacional
**Status:** Corrigido

Produção agora exige:
- R2 account id válido;
- bucket válido;
- access key;
- secret key;
- rota legado desativada.

### F10-02 — Alias legado de segredo de sessão
**Severidade:** Baixa
**Status:** Removido

`MORADA_SESSION_SECRET` não é mais aceito. Existe uma única variável oficial:
`GISELY_SESSION_SECRET`.

### F10-03 — Expiração R2 podia receber número inválido
**Severidade:** Baixa
**Status:** Corrigido

`R2_UPLOAD_EXPIRES_SECONDS` agora tem parser determinístico e clamp de 60–3600 segundos.

### F10-04 — Alertas privados do GitHub indisponíveis pela conexão atual
**Status:** Limitação conhecida

Os endpoints privados de secret scanning/code scanning/dependabot alerts não puderam ser consultados pela ferramenta conectada.

**Compensação:** scanner próprio atual + histórico executado em CI, além de CodeQL e dependency audit.

## Gate da Fase 10

PASS somente se:
- secret scan atual/histórico estiver verde;
- produção falhar sem R2;
- produção rejeitar configuração R2 inválida;
- legado de storage não puder ser ativado em produção;
- segredo de sessão tiver fonte única e forte;
- .env permanecer fora de Git/Docker;
- CI e CodeQL estiverem verdes.

## Próxima fase

**Fase 11 — Banco e proteção básica dos dados**

Foco:
- SQL injection;
- queries parametrizadas;
- identificadores dinâmicos;
- transações;
- concorrência;
- constraints;
- pool/timeouts;
- exposição de colunas.
