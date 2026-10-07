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

## 4. Configurar CORS do bucket

O navegador do CRM envia os arquivos diretamente para a URL temporária do R2. Restrinja o CORS ao domínio do painel:

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

Se houver um ambiente de homologação, adicione explicitamente a origem dele; não use `*` em produção.

## 5. Configurar o painel

No backend:

```env
PUBLIC_ORIGIN=https://www.gisleynunesimoveis.com.br
ADMIN_ORIGIN=https://painel.gisleynunesimoveis.com.br
```

Quando `ADMIN_ORIGIN` estiver configurado:

- `/api/auth/*` e `/api/admin/*` aceitam somente a origem do painel;
- cookies de sessão continuam host-only e não são compartilhados com o domínio público.

## 6. Fluxo de upload

1. Gestor/corretor seleciona a foto no CRM.
2. O navegador mede largura/altura.
3. O backend valida tipo e tamanho e gera uma URL PUT temporária com o `Content-Type` incluído na assinatura.
4. O navegador envia a foto diretamente ao R2.
5. O backend confirma o objeto via HEAD e inspeciona o conteúdo para validar MIME e dimensões reais de JPEG, PNG, WebP ou AVIF; valores declarados pelo navegador precisam coincidir.
6. O banco registra apenas metadados e a rota controlada de leitura.
7. Imóveis publicados usam `/media/*`; rascunhos são visualizados pela rota autenticada do CRM.

O banco registra: provider, MIME, tamanho, dimensões, usuário que enviou, ordem e definição de capa.

## 7. Limpeza

Ao remover uma foto pelo CRM, o registro é removido do banco e o backend tenta excluir também o objeto do R2. Se a limpeza do objeto falhar, a operação do CRM continua e o erro é registrado para manutenção.

## 8. Produção

Antes de ativar:

- confirmar DNS do site e do painel;
- configurar CORS do R2;
- testar upload JPG, PNG, WebP e AVIF;
- testar arquivo acima de 12 MB;
- testar troca de capa e reordenação;
- testar remoção e cache;
- manter o bucket totalmente privado, sem `r2.dev` e sem Custom Domain direto;
- validar que nenhum segredo está no bundle do frontend.
