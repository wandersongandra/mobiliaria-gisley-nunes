# Camada 1 — Fase 5: Validação de entrada

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Garantir que toda entrada externa seja rejeitada quando:
- exceder limites;
- tiver tipo estrutural inesperado;
- trouxer chaves não previstas;
- usar representação numérica ambígua;
- contiver Unicode de controle;
- usar IDs/slugs fora do contrato;
- enviar body não JSON para APIs mutáveis;
- exceder o limite global de payload.

## Controles revisados

### Body HTTP
- JSON limitado a 256 KB;
- JSON malformado -> 400 `INVALID_JSON`;
- payload excessivo -> 413 `PAYLOAD_TOO_LARGE`;
- body com tipo não JSON -> 415 `UNSUPPORTED_MEDIA_TYPE`.

### Contratos fechados
Objetos recebidos por API rejeitam chaves extras.

Exemplos:
- imóvel não aceita `admin`, `role` ou campos arbitrários;
- lead não aceita elevação de papel;
- equipe aceita somente campos previstos;
- foto/upload aceitam apenas o contrato conhecido.

### Texto
- normalização NFC;
- limites explícitos;
- controles C0/C1 perigosos rejeitados;
- bidi override/isolation rejeitados;
- newline/tab rejeitados quando o campo não é multiline.

### Números
Strings numéricas aceitam somente decimal simples.

São rejeitados:
- notação científica;
- hexadecimal;
- sinais;
- `NaN`;
- `Infinity`;
- formatos parciais.

### IDs/slugs
- IDs rejeitam `../`, barras e tamanho excessivo;
- slug aceita somente minúsculas, números e hífen;
- ordem de fotos rejeita duplicados e mais de 40 itens.

### E-mail
- normalizado para lowercase;
- domínio obrigatório;
- local-part sem ponto inicial/final;
- pontos consecutivos rejeitados.

### Query
`audit.limit` aceita somente 1–250.

## Achados

### F5-01 — Logging de erro podia registrar mensagem bruta de parser JSON
**Severidade:** Média-baixa  
**Status:** Corrigido

Em produção, o logger agora registra apenas o código classificado do erro, não a mensagem bruta potencialmente contendo trecho do payload.

### F5-02 — `audit.limit=0` virava 100 silenciosamente
**Severidade:** Baixa  
**Status:** Corrigido

Agora 0 é inválido; somente 1–250 é aceito.

### F5-03 — E-mail aceitava pontos consecutivos no local-part
**Severidade:** Baixa  
**Status:** Corrigido

Foram adicionadas regras explícitas para ponto inicial/final/consecutivo.

### F5-04 — Payload gigante / JSON malformado / media type incorreto
**Resultado:** Protegido

Foram adicionados testes HTTP reais para:
- 400 `INVALID_JSON`;
- 413 `PAYLOAD_TOO_LARGE`;
- 415 `UNSUPPORTED_MEDIA_TYPE`.

## Gate da Fase 5

PASS somente se:
- JSON malformado nunca chegar à lógica de negócio;
- payload >256 KB for bloqueado;
- mutações com body não JSON forem rejeitadas;
- contratos rejeitarem chaves extras;
- tipos estruturais errados falharem;
- números ambíguos falharem;
- IDs/path traversal falharem;
- controles Unicode perigosos falharem;
- limites de query forem estritos;
- CI e CodeQL permanecerem verdes.

## Próxima fase

**Fase 6 — XSS e saída para navegador**

Foco:
- EJS escaping;
- `innerHTML`;
- JSON embutido;
- atributos HTML;
- URLs;
- conteúdo armazenado no CRM;
- CSP como segunda barreira.
