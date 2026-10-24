# Gate pós-auditoria — Gisley Nunes

Base de referência: `migration/laravel-backend-2026-10-02` @ `d6494cbff30d27cdc58eaca94fc0040c6ec02d49`.

Esta PR contém apenas alterações de código e configurações versionadas. **Não autoriza merge, deploy, migration ou gravação em produção.** A PR deve ter como *base* a branch de migração, não `main`, que contém uma linha de desenvolvimento distinta.

## Alterações preparadas

1. **CORS administrativo:** `public/.htaccess` remove `Access-Control-Allow-Origin` e `Access-Control-Allow-Credentials` das tabelas `onsuccess` e `always` para `/admin`, `/api/admin`, `/api/auth` e `/oauth/google/return`. A API pública não é afetada por estas regras.
2. **Cache de CSS/JS:** assets sem `?v=<SHA-256>` exigem revalidação. Assets estáticos com versão SHA-256 na URL recebem `public, max-age=31536000, immutable`. HTML, autenticação, API e mídia privada não recebem esse cache longo.
3. **Versão do painel:** os três URLs de JS/CSS do HTML administrativo usam o SHA-256 de seus arquivos. `pnpm test:source` falha se uma edição posterior mudar um asset sem atualizar seu hash.
4. **Catálogo vazio:** o frontend distingue inventário totalmente vazio (facets globais sem tipo publicado) de filtros que não produziram resultado. Ambos os Blade templates exibem orientação e contato sem JavaScript quando não há cards SSR.

## Verificação da hospedagem — somente após janela autorizada

Como o wildcard foi visto na HostGator, há uma hipótese de configuração do Apache/vhost **fora do repositório**. A regra `.htaccess` é uma mitigação na camada controlável, mas não prova a remoção do cabeçalho emitido por outra camada. Se o provedor inserir o header depois dela, a correção deve ser feita no vhost/painel do provedor.

Após um eventual deploy explicitamente aprovado, verificar de forma somente leitura:

```bash
curl -sSI -X OPTIONS \
  -H 'Origin: https://origem-nao-autorizada.invalid' \
  -H 'Access-Control-Request-Method: POST' \
  https://painel.gisleynunesimoveis.com.br/api/admin/properties

curl -sSI https://painel.gisleynunesimoveis.com.br/admin/main.js
curl -sSI 'https://painel.gisleynunesimoveis.com.br/admin/main.js?v=0d45cb517bcd61feb8a2c073f67b32c246512964a8e67c4702c67f2931801d8f'
curl -sSI https://www.gisleynunesimoveis.com.br/assets/main.js
```

Critérios:

- O `OPTIONS` administrativo não pode retornar `Access-Control-Allow-Origin: *` nem habilitar credenciais cross-origin.
- O JS não versionado deve exigir revalidação; a URL com hash correto deve ser cacheável imutavelmente.
- Nenhum `Cache-Control: public` deve surgir em HTML de sessão, `/api/admin/*`, `/api/auth/*` ou respostas privadas.
- As respostas devem permanecer com a mesma proteção de autenticação, origem e CSRF; não relaxar segurança para atingir uma resposta HTTP específica.
- Validar a sintaxe Apache da `.htaccess` em staging antes de promovê-la; falha no vhost pode causar HTTP 500.

## Bloqueios fora desta PR

- **Banco e storage:** inspeção somente leitura em cPanel/SSH, contagem de registros, mídia órfã, disponibilidade do `MEDIA_ROOT`, espaço em disco e permissões físicas.
- **Mídia histórica:** conferir se o R2 antigo contém objetos que precisam de cópia verificada para o storage local. Não mover ou excluir objetos sem inventário, backup e autorização separados.
- **Backup/restauração:** comprovar cópia válida de banco e arquivos, com teste de recuperação isolado.
- **Publicação ponta a ponta:** criar imóvel temporário, upload, capa, publicar, verificar API e detalhe público, depois restaurar o estado. Precisa de autorização expressa e plano de reversão; a PR não executa essas operações.
- **Infraestrutura:** garantir o funcionamento do cron, versões reais do MySQL/PHP, logs e TLS, que não são comprovados por testes de código.

**Veredito para a liberação comercial completa:** `NO-GO` até os bloqueadores operacionais e o fluxo real serem validados. Uma PR aprovada em CI não equivale à homologação de produção.
