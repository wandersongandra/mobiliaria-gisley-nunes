#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

EXPECTED_BRANCH="migration/laravel-backend-2026-10-02"
PROJECT_ROOT="${PROJECT_ROOT:-/home1/gisley77/repositories/mobiliaria-gisley-nunes}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$EXPECTED_BRANCH}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
COMPOSER_BIN="${COMPOSER_BIN:-$HOME/bin/composer}"
PHP_BIN="${PHP_BIN:-php}"
HEALTH_URL="${HEALTH_URL:-}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"
DEPLOY_STATE_FILE="${DEPLOY_STATE_FILE:-$PROJECT_ROOT/.deploy-state}"
LOCK_DIR="${LOCK_DIR:-$PROJECT_ROOT/.deploy-lock}"

# Arquivos efêmeros criados em public/ durante o deploy e removidos logo após.
# Nomes com prefixo duplo para não colidir com rotas do Laravel.
FPM_CHECK_FILE="$PROJECT_ROOT/public/__fpm_sec_check.php"

fail() {
    printf 'deploy-hostgator: %s\n' "$1" >&2
    exit 1
}

cleanup() {
    rmdir "$LOCK_DIR" 2>/dev/null || true
    # Garante que o arquivo efêmero seja removido mesmo em caso de falha.
    rm -f "$FPM_CHECK_FILE" 2>/dev/null || true
}

if [[ "${ALLOW_HOSTGATOR_DEPLOY:-0}" != "1" ]]; then
    fail 'execução desabilitada; defina ALLOW_HOSTGATOR_DEPLOY=1 somente durante uma janela autorizada'
fi

[[ "$DEPLOY_BRANCH" == "$EXPECTED_BRANCH" ]] || fail "branch rejeitada: $DEPLOY_BRANCH"
[[ "$DEPLOY_BRANCH" != 'main' ]] || fail 'main nunca pode ser publicada por este script'
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'DEPLOY_SHA deve ser um SHA completo de 40 caracteres'
[[ "$RUN_MIGRATIONS" == '0' || "$RUN_MIGRATIONS" == '1' ]] || fail 'RUN_MIGRATIONS deve ser 0 ou 1'
[[ -n "$HEALTH_URL" ]] || fail 'HEALTH_URL é obrigatório; não é permitido publicar sem health check'

cd "$PROJECT_ROOT"
[[ ! -e "$LOCK_DIR" ]] || fail 'já existe outro lock de deploy'
mkdir "$LOCK_DIR"
trap cleanup EXIT

[[ -z "$(git status --porcelain)" ]] || fail 'working tree não está limpo'

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH" || fail 'a branch permitida não existe localmente'
    git switch "$DEPLOY_BRANCH"
fi
[[ "$(git branch --show-current)" == "$DEPLOY_BRANCH" ]] || fail 'o checkout atual não está na branch permitida'

git fetch --prune origin "$DEPLOY_BRANCH"
remote_sha="$(git rev-parse "origin/$DEPLOY_BRANCH")"
git cat-file -e "$DEPLOY_SHA^{commit}" || fail 'DEPLOY_SHA não existe no checkout local'
git merge-base --is-ancestor "$DEPLOY_SHA" "$remote_sha" || fail 'DEPLOY_SHA não pertence à branch remota autorizada'

previous_sha="$(git rev-parse HEAD)"
printf 'previous_sha=%s\nrequested_sha=%s\nbranch=%s\n' "$previous_sha" "$DEPLOY_SHA" "$DEPLOY_BRANCH" > "$DEPLOY_STATE_FILE"

git checkout --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] || fail 'checkout não chegou ao SHA solicitado'

"$COMPOSER_BIN" validate --strict --no-interaction
"$COMPOSER_BIN" install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-progress

# Revalida o mtime do arquivo versionado antes da sonda. O FPM deve carregar
# esta configuração por diretório; a sonda abaixo é o gate que prova o valor
# efetivo, enquanto o comando Artisan só consegue validar o arquivo no CLI.
touch "$PROJECT_ROOT/public/.user.ini" || fail 'não foi possível atualizar o mtime de public/.user.ini'

# ============================================================================
# FPM SECURITY CHECK (PHP2Shell CVE-2026-109618 / CVE-2026-109619)
# ============================================================================
# O php-cli pode estar atualizado enquanto o php-fpm do domínio continua
# vulnerável.  Em vez de verificar via CLI, criamos um script efêmero em
# public/ e o acessamos via HTTP — o request passa pelo PHP-FPM, que é o
# runtime que realmente serve a aplicação.
#
# Derivamos a URL base do HEALTH_URL (ex: https://www.gisleynunesimoveis.com.br
# a partir de https://www.gisleynunesimoveis.com.br/health/live).
BASE_URL="$(printf '%s' "$HEALTH_URL" | sed -E 's|^(https?://[^/]+).*|\1|')"
[[ -n "$BASE_URL" ]] || fail 'não foi possível derivar a URL base do HEALTH_URL'

# Token aleatório embaralhado no script para impedir acesso não autorizado
# durante a janela em que o arquivo existe em public/.
FPM_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
[[ -n "$FPM_TOKEN" ]] || fail 'falha ao gerar token de verificação FPM'

cat > "$FPM_CHECK_FILE" <<ENPHP
<?php
// Script efêmero — removido pelo deploy script imediatamente após o uso.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

\$token = (string) (\$_SERVER['HTTP_X_FPM_CHECK_TOKEN'] ?? '');
if (!is_string(\$token) || !hash_equals('$FPM_TOKEN', \$token)) {
    http_response_code(404);
    echo json_encode(['error' => 'NOT_FOUND']);
    exit;
}

\$patches = [
    '8.2' => '8.2.35', '8.3' => '8.3.36', '8.4' => '8.4.27', '8.5' => '8.5.12',
];
\$patched = false;
foreach (\$patches as \$branch => \$min) {
    if (version_compare(PHP_VERSION, \$branch . '.0', '>=') && version_compare(PHP_VERSION, \$branch . '.999', '<')) {
        \$patched = version_compare(PHP_VERSION, \$min, '>=');
        break;
    }
}
if (!\$patched) {
    \$patched = false;
}

\$up = strtolower((string) ini_get('session.upload_progress.enabled'));
\$upDisabled = (\$up === '0' || \$up === 'off' || \$up === 'false');

\$pms = strtolower(trim((string) ini_get('post_max_size')));
\$pmsBounded = (\$pms !== '' && \$pms !== '-1' && \$pms !== '0');
if (\$pmsBounded) {
    \$u = substr(\$pms, -1); \$v = (int) \$pms;
    \$b = (\$u === 'g') ? \$v*1024**3 : (\$u === 'm') ? \$v*1024**2 : (\$u === 'k') ? \$v*1024 : \$v;
    \$pmsBounded = (\$b > 0 && \$b <= 67108864);
}

echo json_encode([
    'php_version' => PHP_VERSION,
    'sapi' => PHP_SAPI,
    'patched' => \$patched,
    'upload_progress_enabled' => \$up,
    'upload_progress_disabled' => \$upDisabled,
    'post_max_size' => \$pms,
    'post_max_bounded' => \$pmsBounded,
    'secure' => \$patched && \$upDisabled && \$pmsBounded,
], JSON_PRETTY_PRINT);
ENPHP

FPM_CHECK_URL="$BASE_URL/__fpm_sec_check.php"

# Faz várias sondas para observar workers diferentes. Uma resposta insegura
# bloqueia o deploy; não há fallback permissivo nem reset remoto de opcache.
for attempt in 1 2 3 4 5; do
    fpm_response=''
    fpm_response="$(curl --fail --silent --show-error --max-time 15 \
        -H 'Cache-Control: no-cache' \
        -H "X-FPM-Check-Token: $FPM_TOKEN" \
        "$FPM_CHECK_URL" 2>&1)" \
        || fail "falha ao acessar o script de verificação FPM (tentativa $attempt): $fpm_response"

    fpm_secure="$(printf '%s' "$fpm_response" | "$PHP_BIN" -r '
    \$j = json_decode(stream_get_contents(STDIN), true);
    echo isset(\$j["secure"]) ? (\$j["secure"] ? "1" : "0") : "ERR";
    ')"
    [[ "$fpm_secure" == "1" ]] || {
        printf 'deploy-hostgator: FPM runtime NÃO É seguro contra PHP2Shell.\n' >&2
        printf 'Resposta do FPM:\n%s\n' "$fpm_response" >&2
        fail 'O PHP-FPM da HostGator está vulnerável a CVE-2026-109618/109619. Abortando deploy.'
    }
    printf 'FPM security check %d/5 OK:\n%s\n' "$attempt" "$fpm_response"
done

rm -f "$FPM_CHECK_FILE"

"$PHP_BIN" artisan config:clear --no-ansi
"$PHP_BIN" artisan route:clear --no-ansi
"$PHP_BIN" artisan view:clear --no-ansi
"$PHP_BIN" artisan config:cache --no-ansi
"$PHP_BIN" artisan route:cache --no-ansi
"$PHP_BIN" artisan view:cache --no-ansi
"$PHP_BIN" artisan app:production-check

if [[ "$RUN_MIGRATIONS" == '1' ]]; then
    "$PHP_BIN" artisan migrate:status --no-ansi
    "$PHP_BIN" artisan migrate --force --no-ansi
else
    printf 'migrations não executadas; defina RUN_MIGRATIONS=1 em uma janela aprovada\n'
fi

health_body="$(curl --fail --silent --show-error --location --max-time 15 "$HEALTH_URL")" || fail 'health check falhou'
[[ "$health_body" == '{"status":"ok"}' ]] || fail 'health check retornou corpo inesperado'

printf 'deploy validado: %s\n' "$DEPLOY_SHA"
