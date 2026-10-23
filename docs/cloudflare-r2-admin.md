# Cloudflare R2 + painel da Gisley Nunes

Esta configuração separa o site público e o CRM, mantendo o bucket R2 privado:

- `www.gisleynunesimoveis.com.br` — site público;
- `painel.gisleynunesimoveis.com.br` — CRM/admin;
- Cloudflare R2 — armazenamento privado das fotos.

Um futuro `media.gisleynunesimoveis.com.br` só deve ser criado sobre um gateway/Worker que preserve as mesmas regras de autorização. Ele **não deve apontar diretamente para o bucket R2**.

## 1. Criar o bucket

No Cloudflare Dashboard, crie um bucket R2 chamado, por exemplo:

`gisley-nunes-imoveis`

Mantenha o endpoint `r2.dev` desativado em produção.

## 2. Criar credenciais R2

Crie um API Token R2 com acesso somente ao bucket da imobiliária e configure no backend:

```env
R2_ACCOUNT_ID=...
R2_BUCKET=gisley-nunes-imoveis
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_UPLOAD_EXPIRES_SECONDS=600
```

Nunca coloque esses valores no frontend, no GitHub ou no Cloudflare preview público.

## 3. Manter o bucket privado

Na primeira camada de segurança:

- mantenha `r2.dev` desativado;
- não conecte um Custom Domain diretamente ao bucket;
- não habilite listagem pública;
- as URLs persistidas pelo sistema usam `/media/...`, controlado pelo backend.

A rota pública `/media/*` só libera uma URL GET temporária quando o banco confirma que o arquivo pertence a um imóvel com status `published`.

Fotos de rascunho são carregadas no CRM por uma rota autenticada `/api/admin/photos/:id/media`.

Isso impede que uma URL conhecida de uma foto ainda não publicada se torne um atalho para acessar o objeto no R2.

Um domínio `media.gisleynunesimoveis.com.br` poderá ser adicionado futuramente, mas deverá apontar para uma camada de autorização/Worker e nunca diretamente para o bucket.

## 4. CORS do bucket: somente para o fluxo alternativo

O fluxo oficial do painel usa o proxy multipart do backend; o navegador não envia a foto diretamente ao R2 nesse caminho e, portanto, não depende de CORS administrativo do bucket.

Se for usado o fluxo alternativo `presign` → upload direto → registro, restrinja o CORS às origens explicitamente permitidas para o ambiente:

```json
[
  {
    "AllowedOrigins": [
      "https://painel.gisleynunesimoveis.com.br"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "If-None-Match"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Se houver um ambiente de homologação, adicione explicitamente a origem permitida dele; não use `*` em produção.

Um `cors.json` pode existir como arquivo local ou proposta no checkout do operador. Sua presença não permite concluir que está versionado, aplicado ou sincronizado com o bucket. Ele **não prova CORS efetivo no R2**. A política realmente aplicada no bucket, o preflight e um PUT autenticado exigem verificação externa autorizada no Cloudflare/R2; não afirmar que essa configuração foi aplicada sem essa evidência.

## 5. Configurar o painel

No backend:

```env
PUBLIC_ORIGIN=https://www.gisleynunesimoveis.com.br
ADMIN_ORIGIN=https://painel.gisleynunesimoveis.com.br
```

Quando `ADMIN_ORIGIN` estiver configurado no ambiente correspondente:

- `/api/auth/*` e `/api/admin/*` aceitam somente as origens explicitamente permitidas pela configuração daquele ambiente;
- cookies de sessão continuam host-only e não são compartilhados com o domínio público.

Os valores de desenvolvimento, homologação e produção podem ser diferentes. A configuração documentada aqui é uma referência operacional; não confirma o enforcement efetivo em nenhum ambiente sem inspeção e teste autorizados.

## 6. Fluxo oficial de upload e ciclo de publicação

1. Gestor/corretor salva o imóvel no painel, inicialmente como rascunho quando ainda não há capa.
2. O CRM envia a foto como `multipart/form-data` para `POST /api/admin/properties/{id}/photos/upload`.
3. O backend valida tipo, tamanho, MIME e dimensões reais, grava o objeto no R2 e registra os metadados no banco. `isCover` pode definir a capa durante o registro.
4. Se necessário, a capa pode ser alterada por `PUT /api/admin/photos/{id}/cover`; a ordem usa `PUT /api/admin/properties/{id}/photos/order`.
5. O imóvel só é publicado por `PUT /api/admin/properties/{id}` com `status=published` quando possui capa.
6. Imóveis publicados usam `/media/*`; rascunhos são visualizados pela rota autenticada do CRM.

### Fluxo alternativo explícito

Quando o cliente precisar enviar diretamente ao R2, use `POST /api/admin/uploads/presign`, faça o PUT com os headers retornados e depois chame `POST /api/admin/properties/{id}/photos` para registrar a foto. Esse caminho depende do CORS efetivo do bucket e não deve ser confundido com o proxy multipart oficial.

O banco registra: provider, MIME, tamanho, dimensões, usuário que enviou, ordem e definição de capa.

## 7. Limpeza

Ao remover uma foto pelo CRM, o registro é removido do banco e o backend tenta excluir também o objeto do R2. Se a limpeza do objeto falhar, a operação do CRM continua e o erro é registrado para manutenção.

## 8. Produção

Antes de ativar:

- confirmar DNS do site e do painel;
- validar externamente, no ambiente alvo, a configuração efetiva do R2; CORS só é necessário para o fluxo alternativo de upload direto;
- testar upload JPG, PNG, WebP e AVIF;
- testar arquivo acima de 12 MB;
- testar troca de capa e reordenação;
- testar remoção e cache;
- manter o bucket totalmente privado, sem `r2.dev` e sem Custom Domain direto;
- validar que nenhum segredo está no bundle do frontend;
- confirmar externamente, em ambiente autorizado, o upload multipart pelo proxy, a configuração real do bucket e, se aplicável, o preflight/PUT do fluxo presign.

Esses itens externos permanecem **NÃO VERIFICADOS** por esta documentação; nada aqui afirma que CORS, bucket, credenciais, enforcement por ambiente ou upload real foram aplicados ou validados.
