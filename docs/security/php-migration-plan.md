# Plano de migração da série PHP

Data de revisão: 22 de outubro de 2026

## Decisão

A série PHP 8.2 recebe suporte de segurança até **31/12/2026**. O projeto
continua exigindo `php >= 8.2.35`; esta PR não migra a versão mínima, não reduz
o gate e não altera o PHP-FPM da hospedagem.

O PHP 8.2.35 foi lançado em **21/10/2026**. A disponibilidade no HostGator,
especialmente no pool PHP-FPM que atende o vhost, ainda precisa ser confirmada
manualmente. Se o 8.2.35 não estiver disponível, o gate de deploy deve
continuar bloqueando o release.

Fontes oficiais: [suporte de versões do PHP](https://www.php.net/supported-versions.php)
e [release PHP 8.2.35](https://www.php.net/releases/8_2_35.php).

## Alvo e prazo

O alvo preferencial é PHP **8.4**; PHP 8.3 é o fallback caso alguma extensão ou
limitação do HostGator impeça 8.4. A decisão de alvo deve ser fechada até
**30/11/2026**, com validação de staging antes de **11/12/2026** e janela
operacional planejada antes de **31/12/2026**. Nenhuma etapa de produção faz
parte desta PR.

## Matriz de CI planejada

| Job | Runtime | Controles | Critério |
|---|---|---|---|
| `php-8.2-baseline` | 8.2.35 | PHPUnit Feature, PHPStan, Pint direcionado, `composer validate`, `composer audit` | Continua obrigatório enquanto a aplicação ainda roda em 8.2 |
| `php-8.3-compat` | último patch suportado de 8.3 | mesma suíte e extensões | Nenhuma falha funcional, de tipos ou de dependência |
| `php-8.4-target` | último patch suportado de 8.4 | mesma suíte, build e auditorias | Candidato a novo runtime mínimo após homologação |

Durante a transição, todos os jobs devem ser obrigatórios; falha ou runtime
indisponível é fail-closed. A migração somente deve ser proposta em PR
separada, com diff de dependências explícito e rollback compatível.

## Compatibilidade a verificar

- `composer.json` exige PHP `>=8.2.35`, Laravel `^12.0` e `aws/aws-sdk-php ^3.0`;
  validar a matriz completa no lockfile com `composer validate` e
  `composer audit` em cada runtime.
- Executar os testes com as extensões efetivas usadas pelo projeto, incluindo
  `openssl`, `curl`, `mbstring`, `fileinfo`, `pdo_mysql`, `gd`, `zip` e `intl`.
  A lista efetiva do PHP-FPM deve ser obtida no vhost de staging, não inferida
  do PHP CLI.
- Revalidar `.user.ini`, sessão, upload, `memory_limit`, `post_max_size`,
  `upload_max_filesize` e o gate da sonda no PHP-FPM de staging.
- Confirmar que Laravel 12, PHPStan/Larastan, PHPUnit e Pint permanecem
  compatíveis sem atualizar dependências de forma indiscriminada.

## Checklist do HostGator

- [ ] Confirmar no painel/SSH do HostGator que **PHP 8.2.35** está disponível.
- [ ] Confirmar o mesmo patch no PHP-FPM do vhost, não apenas no CLI.
- [ ] Se 8.2.35 não estiver disponível, registrar `BLOCKED` e manter o gate de
      deploy bloqueando; não reduzir `composer.json` nem contornar a sonda.
- [ ] Depois de escolher 8.3/8.4, provar o runtime no vhost de staging e
      repetir a suíte completa antes de qualquer decisão operacional.

## Rollback do plano

Se qualquer job, extensão, sonda ou verificação de FPM falhar, manter o runtime
anterior apenas se ele continuar dentro do gate de segurança; interromper o
release e abrir correção específica. Não executar rollback em produção nesta
PR e não aceitar uma versão abaixo de 8.2.35.
