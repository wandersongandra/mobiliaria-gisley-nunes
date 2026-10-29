# Camada 1 — Fase 7: Upload e mídia adversarial

Data da revisão: 2026-10-01  
Branch auditada: `audit/security-design-2026-09-30`

## Objetivo

Tratar todo upload como hostil e garantir que um cliente autenticado não consiga:
- enviar arquivo acima do limite real;
- mentir sobre MIME;
- registrar objeto inexistente;
- usar path de outro imóvel;
- registrar executável/SVG como imagem;
- sobrescrever arquivo já validado reutilizando URL assinada;
- deixar objetos órfãos após falha de persistência.

## Fluxo protegido

1. CRM envia multipart para o endpoint autenticado do imóvel.
2. Backend valida permissão sobre o imóvel, limite de galeria e limite de corpo.
3. Backend lê os bytes recebidos dentro do limite de 12 MB e valida:
   - MIME real e magic bytes;
   - dimensões e área de pixels.
4. Backend gera chave aleatória no prefixo `gisley/properties/<propertyId>/`.
5. Backend faz `PutObject` server-side no R2 com Content-Length real.
6. Banco registra metadados somente após o upload validado.
7. Se persistência falhar, objeto recém-enviado é removido.
8. Exclusão de foto tenta remover também o objeto do R2.

## Formatos permitidos

- JPEG/JPG;
- PNG;
- WebP;
- AVIF.

Não permitidos:
- SVG;
- executáveis;
- octet-stream genérico;
- extensões fora da lista;
- arquivo vazio;
- arquivo >12 MB.

## Achados

### F7-01 — Tamanho e MIME reais do objeto não eram comparados ao declarado
**Severidade:** Alta  
**Status:** Corrigido no fluxo ativo; validação mantida no registro legado

Antes, o cliente declarava tamanho/MIME para obter a presigned URL, mas a confirmação posterior verificava apenas existência + assinatura mágica.

Um cliente adulterado poderia tentar enviar um objeto maior e depois declarar novamente o tamanho autorizado.

**Correção:** HEAD do R2 agora captura `Content-Length` e `Content-Type` reais e compara com o contrato original antes de persistir.

### F7-02 — Presigned PUT poderia ser reutilizado até expirar
**Severidade:** Média-Alta  
**Status:** Eliminado

Uma URL pré-assinada é um bearer token e poderia ser reutilizada até expirar se fosse entregue ao navegador.

**Correção:** a superfície Laravel não entrega mais URL de upload ao navegador. O upload passa pelo servidor, que valida os bytes e controla o `PutObject`.

### F7-03 — Path traversal / upload para outro imóvel
**Resultado:** Bloqueado

`storagePathBelongsToProperty()` exige namespace exato do imóvel e rejeita barras/traversal no ID.

### F7-04 — MIME falso / executável renomeado
**Resultado:** Bloqueado em múltiplas camadas

- enum de MIME;
- extensão do objeto derivada do MIME real;
- Content-Type definido pelo servidor;
- Content-Type persistido após inspeção;
- magic bytes.

### F7-05 — SVG
**Resultado:** Bloqueado

SVG não entra no enum de MIME e não passa assinatura mágica.

### F7-06 — Objeto órfão
**Resultado:** Mitigado

Falha após upload e antes da persistência dispara tentativa de remoção do objeto.

### F7-07 — Limite de galeria
**Resultado:** Protegido

Limite de 40 fotos existe:
- antes do upload server-side;
- antes de registrar a foto;
- dentro da transação do banco para evitar corrida.

## Limitação residual conhecida

A validação de imagem usa assinatura/magic bytes, não decodificação e re-encode completo da imagem.

Isso é adequado para a primeira camada junto com MIME real e CSP, mas a Camada 2 pode elevar o controle usando pipeline de imagem que decodifica e regrava o arquivo (por exemplo, WebP/AVIF derivados), eliminando metadados e formatos poliglotas de forma ainda mais forte.

## Gate da Fase 7

PASS somente se:
- tamanho real do R2 for validado;
- MIME real do R2 for validado;
- extensão e MIME coincidirem;
- magic bytes coincidirem;
- SVG/executável/vazio/grande falharem;
- path não atravessar imóveis;
- o backend nunca entregue bearer token de upload ao navegador;
- falha de DB limpar upload recém-criado;
- limite transacional da galeria permanecer;
- CI e CodeQL estiverem verdes.

## Próxima fase

**Fase 8 — Headers e política HTTP**

Foco:
- CSP;
- HSTS;
- nosniff;
- Referrer-Policy;
- Permissions-Policy;
- COOP/CORP;
- cache privado;
- headers de auth/admin;
- tecnologias expostas.
