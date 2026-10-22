# Checklist de homologação de segurança

Data de preparação: 2026-10-22
Escopo: ambiente de homologação/staging, sem produção, sem DNS real e sem banco real.

Os comandos abaixo usam placeholders. Substitua-os somente por valores de um ambiente de teste autorizado; nunca coloque tokens, cookies, chaves ou secrets no terminal compartilhado, no log ou no relatório.

## 1. R2 real e ciclo de upload

Pré-requisitos: bucket privado de homologação, credenciais temporárias autorizadas e banco de homologação isolado.

Passos:

1. Abra o painel de homologação e inicie um upload JPG, PNG, WebP e AVIF válidos.
2. Confirme no DevTools que a URL PUT é temporária e que os headers enviados incluem exatamente `Content-Type` e `If-None-Match: *`.
3. Confirme que o PUT retorna sucesso e que o backend confirma o objeto antes de registrar a mídia.
4. Repita com extensão alterada, MIME declarado incorreto, arquivo poliglota, arquivo acima de 12 MiB, dimensões acima do limite e pixels acima do limite.
5. Remova uma mídia e confirme a exclusão do registro, a tentativa de remoção do objeto e o registro de erro sem exposição de dados.
6. Execute a rotina de limpeza somente no bucket de homologação e confirme que ela não remove objetos registrados.

Comandos de apoio, sem credenciais:

```powershell
curl.exe -i "https://<STAGING_ADMIN_ORIGIN>/api/admin/photos/<PHOTO_ID>/media" -H "Cookie: __Host-gisley_session=<TEST_SESSION_COOKIE>" -H "Host: <STAGING_ADMIN_HOST>"
curl.exe -i -X OPTIONS "https://<R2_TEST_ENDPOINT>/<OBJECT_KEY>" -H "Origin: https://<STAGING_ADMIN_ORIGIN>" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type,if-none-match"
```

Resultado esperado: somente objetos privados, chaves imutáveis do backend, headers assinados coerentes, MIME e conteúdo reais coincidentes, rejeição dos cenários negativos e nenhum registro órfão novo após a limpeza.

Critério de aprovação: todos os formatos permitidos passam; cada cenário negativo retorna erro 4xx controlado; nenhum objeto privado fica acessível sem autorização; R2 e banco permanecem consistentes.

Critério de reprovação: wildcard de origem, PUT sem `If-None-Match`, leitura pública, MIME aceito apenas pelo valor do navegador, sobrescrita de chave, ou registro no banco sem confirmação do objeto.

Rollback: interromper o teste, revogar as credenciais temporárias, remover somente os objetos de teste identificados e restaurar o estado do banco de homologação conforme o procedimento do ambiente. Não executar limpeza ampla.

Status atual: NOT VERIFIED — R2 real, endpoint privado e ciclo no navegador não foram acessados nesta sessão.

## 2. CORS real do bucket

Arquivo proposto: [`docs/cors.proposed.json`](cors.proposed.json). O `cors.json` local não é fonte aprovada e não deve ser sobrescrito nem incluído na PR.

Passos:

1. Em homologação, liste a configuração atual sem aplicar alterações.
2. Compare a configuração efetiva com `docs/cors.proposed.json`.
3. Faça preflight a partir do domínio de painel de homologação e de uma origem não permitida.
4. Após autorização explícita do responsável pelo bucket, aplique a proposta somente no bucket de homologação.
5. Repita o preflight e teste um PUT real com os dois headers assinados.

Comandos de apoio:

```powershell
wrangler r2 bucket cors list <R2_TEST_BUCKET>
curl.exe -i -X OPTIONS "https://<R2_TEST_ENDPOINT>/<OBJECT_KEY>" -H "Origin: https://<STAGING_ADMIN_ORIGIN>" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type,if-none-match"
curl.exe -i -X OPTIONS "https://<R2_TEST_ENDPOINT>/<OBJECT_KEY>" -H "Origin: https://example.invalid" -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type,if-none-match"
```

Resultado esperado: somente a origem do painel autorizado recebe `Access-Control-Allow-Origin`; somente PUT e os headers explícitos são permitidos; `ETag` é exposto; preflight externo falha.

Critério de aprovação: configuração efetiva equivalente à proposta, sem wildcard e sem métodos/headers extras.

Critério de reprovação: configuração em formato inválido, origem extra, wildcard, métodos além de PUT ou preflight não autorizado aprovado.

Rollback: restaurar a configuração anterior documentada do bucket de homologação ou remover a regra aplicada, usando o procedimento oficial do provedor e confirmação do bucket alvo.

Status atual: NOT VERIFIED — não houve acesso ao bucket nem aplicação de CORS.

## 3. PHP-FPM e HostGator

Pré-requisitos: acesso SSH/SFTP ao ambiente de homologação e um hostname de teste apontando para o release correto.

Passos:

1. Verifique o PHP CLI e o PHP-FPM efetivo; eles devem estar em patch suportado, não apenas o CLI.
2. Execute o preflight do release e confirme que `public/.user.ini` está no diretório público correto.
3. Confirme via HTTP que `session.upload_progress.enabled=0` e `post_max_size` estão efetivos no FPM.
4. Simule uma instalação com PHP abaixo de 8.2.35, uma diretiva ausente e uma falha de probe; o deploy deve abortar e limpar o arquivo temporário.
5. Confirme permissões mínimas: apenas `storage` e `bootstrap/cache` graváveis pela aplicação; `.env`, `vendor` sensível e arquivos internos não expostos.

Comandos de apoio:

```powershell
ssh <STAGING_SSH_USER>@<STAGING_SSH_HOST> "cd <STAGING_RELEASE_DIR> && php -v; php artisan app:production-check --no-ansi"
curl.exe -i -H "Cache-Control: no-cache" -H "Pragma: no-cache" -H "X-FPM-Check-Token: <PROBE_TOKEN>" "https://<STAGING_HOST>/<RANDOM_PROBE_FILENAME>.php?fpm_probe=<RANDOM_CACHE_BUSTER>"
$env:ALLOW_HOSTGATOR_DEPLOY = '1'
$env:DEPLOY_BRANCH = '<AUTHORIZED_BRANCH>'
$env:DEPLOY_SHA = '<40_HEX_SHA>'
$env:PROJECT_ROOT = '<STAGING_RELEASE_DIR>'
$env:HEALTH_URL = 'https://<STAGING_HOST>/health/live'
$env:RUN_MIGRATIONS = '0'
bash scripts/deploy-hostgator.sh
```

Resultado esperado: release abortado em qualquer falha obrigatória; nenhuma mensagem imprime secrets; probe retorna somente os valores de controle esperados e é removido ao final.

Critério de aprovação: PHP-FPM efetivo atende o patch mínimo da branch, upload progress está desabilitado, `post_max_size` está limitado e todas as falhas são fail-closed.

Critério de reprovação: CLI aprovado com FPM divergente, fallback permissivo, probe público persistente, `.env` acessível ou deploy continua após falha.

Rollback: não prosseguir com o release; manter o release anterior intacto e usar o rollback operacional do HostGator somente para o ambiente de homologação autorizado.

Status atual: NOT VERIFIED — o PHP CLI padrão continua em 8.2.29; o PHP oficial temporário 8.2.35 foi usado nesta sessão e passou os gates locais; FPM/HostGator não foram acessados.

## 4. Cloudflare WAF / PHP2Shell

Pré-requisitos: regra em modo de homologação/log ou ambiente de teste, sem alterar o zone de produção.

Passos:

1. Confirme no dashboard/API que a regra está presente, habilitada no escopo correto e não cobre endpoints legítimos de upload.
2. Use um endpoint de teste autorizado e uma requisição multipart inofensiva que corresponda às condições documentadas.
3. Confirme bloqueio/challenge, evento no Security Events e ausência do payload nos logs da aplicação.
4. Teste um upload legítimo permitido e confirme que o WAF não quebra o fluxo aprovado.

Comando somente de leitura:

```powershell
curl.exe -sS -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" "https://api.cloudflare.com/client/v4/zones/<STAGING_ZONE_ID>/rulesets"
```

Resultado esperado: a regra correspondente ao rascunho `docs/security/cloudflare-waf-php2shell.txt` existe no zone de homologação, bloqueia somente o padrão previsto e não expõe tokens.

Critério de aprovação: evidência no Security Events e teste legítimo aprovado.

Critério de reprovação: regra ausente, desabilitada, em zone errado, bypass sem evento ou bloqueio de tráfego legítimo.

Rollback: desabilitar/remover somente a regra de homologação identificada, após registrar o ID; não alterar produção.

Status atual: NOT VERIFIED — o documento é apenas um rascunho; a regra não foi aplicada nem consultada.

## 5. OAuth de produção

Pré-requisitos: contas de teste, redirect URI registrada e janela de homologação autorizada.

Passos:

1. Inicie login no domínio de painel esperado e confirme que a redirect URI enviada é exatamente a registrada.
2. Conclua com uma conta verificada e confirme sessão criada, cookie `__Host-`, Secure, HttpOnly e SameSite adequado.
3. Tente reutilizar o `state`, trocar o `state`, usar callback em host diferente e repetir o callback; todos devem falhar.
4. Teste conta não verificada, convite expirado e logout; confirme revogação e ausência de acesso posterior.
5. Verifique que falhas externas retornam resposta controlada, sem token, stack trace ou segredo.

Comandos de apoio:

```powershell
curl.exe -i "https://<STAGING_ADMIN_ORIGIN>/api/auth/login"
curl.exe -i "https://<STAGING_ADMIN_ORIGIN>/api/auth/callback?code=<TEST_CODE>&state=<TEST_STATE>"
```

Resultado esperado: state de uso único e vinculado ao redirect URI, HTTPS obrigatório, sem open redirect, conta não autorizada rejeitada e logout invalidando a sessão.

Critério de aprovação: todos os cenários positivos/negativos passam sem exposição de credenciais.

Critério de reprovação: state reutilizável, callback aceito em host não autorizado, sessão persistente após logout ou redirect controlável pelo cliente.

Rollback: interromper a janela, revogar a conta de teste e remover somente configurações de OAuth do ambiente de homologação alteradas durante o teste.

Status atual: NOT VERIFIED — OAuth externo/produção não foi acessado.

## 6. Upload via navegador

Pré-requisitos: navegador limpo, usuário de homologação com permissão mínima e DevTools/Playwright disponíveis.

Passos:

1. Teste teclado, foco, mensagens de erro e estados de carregamento.
2. Faça upload dos formatos permitidos e confirme o ciclo PUT → confirmação → banco → visualização.
3. Teste arquivo inválido, poliglota, grande, dimensão/pixels excessivos, cancelamento e perda de rede.
4. Abra a mídia publicada e rascunho em janelas autenticada e não autenticada; confirme autorização e headers de conteúdo/disposição.
5. Remova/substitua a mídia e confirme que a URL anterior não permite acesso indevido.

Comando de apoio local/staging:

```powershell
pnpm test:browser -- --project=chromium
```

Resultado esperado: fluxos positivos funcionam no browser real; erros são recuperáveis; nenhuma URL privada aparece em HTML público; controles de teclado e foco permanecem utilizáveis.

Critério de aprovação: desktop e viewport móvel cobertos, cenários negativos rejeitados e nenhuma violação de autorização.

Critério de reprovação: upload aceito por MIME declarado apenas, objeto privado público, erro silencioso, foco inacessível ou falha de limpeza.

Rollback: cancelar a sessão de teste e remover apenas artefatos identificados no bucket/banco de homologação.

Status atual: NOT VERIFIED — o browser contra o ciclo real de R2 não foi executado nesta sessão.

## 7. Deploy fail-closed

Pré-requisitos: release de homologação, artefato versionado e diretório de rollback conhecido.

Passos:

1. Rode o script com configuração válida e capture o SHA do artefato implantado.
2. Rode com PHP abaixo do mínimo, `APP_DEBUG=true`, origem insegura, segredo ausente, extensão ausente, `.user.ini` ausente e probe FPM com falha.
3. Para cada falha, confirme exit code diferente de zero, ausência de promoção do release e limpeza de temporários.
4. Com configuração válida, confirme health check, headers de segurança, rotas públicas e painel.
5. Registre o plano de rollback sem executá-lo contra produção.

Comandos de apoio:

```powershell
$env:ALLOW_HOSTGATOR_DEPLOY = '1'
$env:DEPLOY_BRANCH = '<AUTHORIZED_BRANCH>'
$env:DEPLOY_SHA = '<40_HEX_SHA>'
$env:PROJECT_ROOT = '<STAGING_RELEASE_DIR>'
$env:HEALTH_URL = 'https://<STAGING_HOST>/health/live'
$env:RUN_MIGRATIONS = '0'
bash scripts/deploy-hostgator.sh
ssh <STAGING_SSH_USER>@<STAGING_SSH_HOST> "cd <STAGING_RELEASE_DIR> && php artisan app:production-check --no-ansi"
```

Resultado esperado: qualquer gate obrigatório falha fechado; configuração inválida não é publicada; configuração válida só promove o artefato esperado.

Critério de aprovação: matriz de falhas com exit code, log sem secret e release anterior preservado.

Critério de reprovação: fallback permissivo, promoção parcial, migração destrutiva, rollback não determinístico ou alteração fora do ambiente alvo.

Rollback: usar o release anterior já identificado e o procedimento operacional aprovado; não executar migrations destrutivas nem comandos em produção.

Status atual: NOT VERIFIED — deploy foi proibido e não foi executado.
