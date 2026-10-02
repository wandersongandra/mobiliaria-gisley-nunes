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

1. CRM pede presign com imóvel, nome, MIME e tamanho declarado.
2. Backend valida contrato, extensão e permissão sobre o imóvel.
3. Backend gera chave aleatória em:
   `gisley/properties/<propertyId>/<uuid>-<nome>`.
4. URL PUT é assinada com:
   - Content-Type;
   - Host;
   - `If-None-Match: *`.
5. Navegador envia diretamente ao R2.
6. Backend consulta HEAD do objeto real.
7. Backend valida:
   - existência;
   - Content-Length real;
   - Content-Type real;
   - limite de 12 MB;
   - igualdade com tamanho/MIME declarados.
8. Backend lê bytes iniciais e valida assinatura de JPEG/PNG/WebP/AVIF.
9. Backend confirma que a chave pertence ao imóvel correto.
10. Banco registra metadados somente após todas as verificações.
11. Se persistência falhar, objeto recém-enviado é removido.
12. Exclusão de foto tenta remover também o objeto do R2.

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
**Status:** Corrigido

Antes, o cliente declarava tamanho/MIME para obter a presigned URL, mas a confirmação posterior verificava apenas existência + assinatura mágica.

Um cliente adulterado poderia tentar enviar um objeto maior e depois declarar novamente o tamanho autorizado.

**Correção:** HEAD do R2 agora captura `Content-Length` e `Content-Type` reais e compara com o contrato original antes de persistir.

### F7-02 — Presigned PUT poderia ser reutilizado até expirar
**Severidade:** Média-Alta  
**Status:** Corrigido

Uma presigned URL S3 é reutilizável até expirar. Após a primeira validação, a mesma URL poderia ser reutilizada para tentar sobrescrever a chave.

**Correção:** PUT agora exige `If-None-Match: *` dentro da assinatura SigV4. Depois que a chave existe, novo PUT para a mesma chave deve falhar por precondição.

O CORS do bucket precisa permitir:
- `Content-Type`;
- `If-None-Match`.

### F7-03 — Path traversal / upload para outro imóvel
**Resultado:** Bloqueado

`storagePathBelongsToProperty()` exige namespace exato do imóvel e rejeita barras/traversal no ID.

### F7-04 — MIME falso / executável renomeado
**Resultado:** Bloqueado em múltiplas camadas

- enum de MIME;
- extensão compatível com MIME;
- Content-Type assinado;
- Content-Type real do R2;
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
- antes do presign;
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
- presigned PUT não puder sobrescrever chave existente;
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
