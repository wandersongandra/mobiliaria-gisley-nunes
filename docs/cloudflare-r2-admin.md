# Cloudflare R2 + painel da Gisley Nunes

Esta configuração separa o projeto em três origens:

- `www.gisleynunesimoveis.com.br` — site público;
- `painel.gisleynunesimoveis.com.br` — CRM/admin;
- `media.gisleynunesimoveis.com.br` — leitura/cache das fotos.

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

## 3. Conectar o domínio de mídia

Em R2 > bucket > Settings > Public access > Custom Domains, conecte:

`media.gisleynunesimoveis.com.br`

Depois configure:

```env
MEDIA_PUBLIC_ORIGIN=https://media.gisleynunesimoveis.com.br
```

O backend usa o endpoint S3 do R2 para gerar URLs temporárias de upload e o domínio `media` apenas para leitura pública.

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
      "Content-Type"
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

- `/admin` acessado pelo domínio público redireciona para o painel;
- `/api/auth/*` e `/api/admin/*` aceitam somente a origem do painel;
- cookies de sessão continuam host-only e não são compartilhados com o domínio público.

## 6. Fluxo de upload

1. Gestor/corretor seleciona a foto no CRM.
2. O navegador mede largura/altura.
3. O backend valida tipo e tamanho e gera uma URL PUT temporária.
4. O navegador envia a foto diretamente ao R2.
5. O backend confirma que o objeto existe via HEAD.
6. O banco registra apenas metadados e a URL de leitura.
7. A foto é exibida pelo domínio `media`.

O banco registra: provider, MIME, tamanho, dimensões, usuário que enviou, ordem e definição de capa.

## 7. Limpeza

Ao remover uma foto pelo CRM, o registro é removido do banco e o backend tenta excluir também o objeto do R2. Se a limpeza do objeto falhar, a operação do CRM continua e o erro é registrado para manutenção.

## 8. Produção

Antes de ativar:

- confirmar DNS dos três domínios;
- configurar CORS do R2;
- testar upload JPG, PNG, WebP e AVIF;
- testar arquivo acima de 12 MB;
- testar troca de capa e reordenação;
- testar remoção e cache;
- manter o bucket sem listagem pública;
- validar que nenhum segredo está no bundle do frontend.
