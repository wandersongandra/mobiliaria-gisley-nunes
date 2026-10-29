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
ALLOW_HOSTGATOR_ROLLBACK="${ALLOW_HOSTGATOR_ROLLBACK:-0}"
DEPLOY_STATE_FILE="${DEPLOY_STATE_FILE:-$PROJECT_ROOT/.deploy-state}"
LOCK_DIR="${LOCK_DIR:-$PROJECT_ROOT/.deploy-lock}"
TMP_DIR="${TMPDIR:-/tmp}"

FPM_CHECK_FILE=''
FPM_HEADERS_FILE=''
FPM_BODY_FILE=''
FPM_CURL_CONFIG_FILE=''
LOCK_ACQUIRED=0

fail() {
    printf 'deploy-hostgator: %s\n' "$1" >&2
    exit 1
}

cleanup() {
    if (( LOCK_ACQUIRED == 1 )); then
        rmdir -- "$LOCK_DIR" 2>/dev/null || true
    fi
    for temporary_file in "$FPM_CHECK_FILE" "$FPM_HEADERS_FILE" "$FPM_BODY_FILE" "$FPM_CURL_CONFIG_FILE"; do
        if [[ -n "$temporary_file" ]]; then
            rm -f -- "$temporary_file" 2>/dev/null || true
        fi
    done
}

handle_signal() {
    cleanup
    exit "$1"
}

trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

umask 077

# O umask restritivo protege segredos, caches e a sonda PHP efêmera. Porém,
# arquivos públicos extraídos pelo checkout sob 077 podem ficar em 0600 e
# diretórios em 0700, causando HTTP 403 no LiteSpeed/Apache. Ajuste somente
# os caminhos estáticos conhecidos; não abra permissões de .env, storage,
# bootstrap/cache, .user.ini ou arquivos não públicos.
restore_public_permissions() {
    local public_path public_dir

    public_path="$PROJECT_ROOT/public"
    [[ -d "$public_path" && ! -L "$public_path" ]] || fail 'diretório public inválido'
    chmod 0755 -- "$public_path" || fail 'falha ao ajustar permissões de public'

    for public_path in "$PROJECT_ROOT/public/index.php" "$PROJECT_ROOT/public/.htaccess"; do
        [[ -f "$public_path" && ! -L "$public_path" ]] || fail "arquivo público inválido: $public_path"
        chmod 0644 -- "$public_path" || fail "falha ao ajustar permissões: $public_path"
    done

    for public_dir in "$PROJECT_ROOT/public/assets" "$PROJECT_ROOT/public/admin" "$PROJECT_ROOT/public/images"; do
        [[ -d "$public_dir" && ! -L "$public_dir" ]] || fail "diretório estático inválido: $public_dir"
        find "$public_dir" -type d -exec chmod 0755 -- {} + || fail "falha nas permissões dos diretórios: $public_dir"
        find "$public_dir" -type f ! -name '.*' -exec chmod 0644 -- {} + || fail "falha nas permissões dos arquivos: $public_dir"
    done
}

if [[ "${ALLOW_HOSTGATOR_DEPLOY:-0}" != "1" ]]; then
    fail 'execução desabilitada; defina ALLOW_HOSTGATOR_DEPLOY=1 somente durante uma janela autorizada'
fi

[[ "$DEPLOY_BRANCH" == "$EXPECTED_BRANCH" ]] || fail "branch rejeitada: $DEPLOY_BRANCH"
[[ "$DEPLOY_BRANCH" != 'main' ]] || fail 'main nunca pode ser publicada por este script'
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'DEPLOY_SHA deve ser um SHA completo de 40 caracteres'
[[ "$RUN_MIGRATIONS" == '0' || "$RUN_MIGRATIONS" == '1' ]] || fail 'RUN_MIGRATIONS deve ser 0 ou 1'
[[ "$ALLOW_HOSTGATOR_ROLLBACK" == '0' || "$ALLOW_HOSTGATOR_ROLLBACK" == '1' ]] || fail 'ALLOW_HOSTGATOR_ROLLBACK deve ser 0 ou 1'
[[ -n "$HEALTH_URL" ]] || fail 'HEALTH_URL é obrigatório; não é permitido publicar sem health check'

cd "$PROJECT_ROOT"
[[ ! -e "$LOCK_DIR" ]] || fail 'já existe outro lock de deploy'
mkdir "$LOCK_DIR"
LOCK_ACQUIRED=1

[[ -z "$(git status --porcelain)" ]] || fail 'working tree não está limpo'

# A revisão original deve ser preservada antes de qualquer mudança de branch.
# O deploy aceita o checkout detached usado pela hospedagem; branches locais
# diferentes da branch autorizada são rejeitadas.
previous_sha="$(git rev-parse HEAD)"
current_branch="$(git branch --show-current)"
if [[ -n "$current_branch" && "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    fail 'o checkout atual está em uma branch não autorizada'
fi

git fetch --prune origin "$DEPLOY_BRANCH"
remote_sha="$(git rev-parse "origin/$DEPLOY_BRANCH")"
git cat-file -e "$DEPLOY_SHA^{commit}" || fail 'DEPLOY_SHA não existe no checkout local'
git merge-base --is-ancestor "$DEPLOY_SHA" "$remote_sha" || fail 'DEPLOY_SHA não pertence à branch remota autorizada'
if [[ "$DEPLOY_SHA" != "$remote_sha" && "$ALLOW_HOSTGATOR_ROLLBACK" != "1" ]]; then
    fail 'DEPLOY_SHA não é o tip atual; rollback exige ALLOW_HOSTGATOR_ROLLBACK=1'
fi

if [[ "$RUN_MIGRATIONS" == '0' ]] && ! git diff --quiet "$previous_sha" "$DEPLOY_SHA" -- database/migrations/; then
    fail 'migrations alteradas entre o checkout e o release: publicar exige RUN_MIGRATIONS=1 e backup validado'
fi
printf 'previous_sha=%s\nrequested_sha=%s\nbranch=%s\n' "$previous_sha" "$DEPLOY_SHA" "$DEPLOY_BRANCH" > "$DEPLOY_STATE_FILE"

git checkout --detach "$DEPLOY_SHA"
[[ "$(git rev-parse HEAD)" == "$DEPLOY_SHA" ]] || fail 'checkout não chegou ao SHA solicitado'
restore_public_permissions

"$COMPOSER_BIN" validate --strict --no-interaction
"$COMPOSER_BIN" install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-progress

# Revalida o mtime do arquivo versionado antes da sonda. O runtime web
# (PHP-FPM ou LiteSpeed LSAPI) precisa carregar a configuração por diretório.
# Apenas a sonda HTTP comprova os valores efetivos; CLI não é suficiente.
touch "$PROJECT_ROOT/public/.user.ini" || fail 'não foi possível atualizar o mtime de public/.user.ini'

# ============================================================================
# WEB PHP SECURITY CHECK (PHP2Shell CVE-2026-109618 / CVE-2026-109619)
# ============================================================================
# O php-cli pode estar atualizado enquanto o PHP web do domínio continua
# vulnerável. A sonda efêmera em public/ valida o runtime realmente servido.
# Somente SAPIs conhecidos (PHP-FPM e LiteSpeed LSAPI), com versão patched,
# upload-progress desativado e POST limitado, podem passar pelo gate.
#
# Derivamos a URL base do HEALTH_URL (ex: https://www.gisleynunesimoveis.com.br
# a partir de https://www.gisleynunesimoveis.com.br/health/live).
BASE_URL="$(printf '%s' "$HEALTH_URL" | sed -E 's|^(https?://[^/]+).*|\1|')"
[[ "$BASE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] \
    || fail 'HEALTH_URL deve usar HTTPS e um host simples do mesmo vhost'

# Checagem real sem cache: uma falha de permissões nunca pode passar pelo
# gate e deixar a página sem CSS/JS mesmo com /health/live saudável.
ASSET_CACHE_BUSTER="$(openssl rand -hex 16)" || fail 'falha ao gerar cache-buster de assets'
for public_asset in \
    /assets/main.css /assets/main.js \
    /admin/index.html /admin/main.js /admin/refinements.css /admin/styles.css; do
    curl --fail --silent --show-error --max-time 15 \
        --output /dev/null \
        -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
        "$BASE_URL$public_asset?deploy_asset_probe=$ASSET_CACHE_BUSTER" \
        || fail "asset público indisponível após checkout: $public_asset"
done

# O arquivo e o token são imprevisíveis. O arquivo temporário recebe modo 600;
# o worker PHP web deve executar sob o usuário da conta que faz o deploy.
FPM_CHECK_FILE="$(mktemp "$PROJECT_ROOT/public/.fpm_sec_check.XXXXXX.php")" \
    || fail 'falha ao criar arquivo temporário de verificação FPM'
FPM_TOKEN="$(openssl rand -hex 32)" \
    || fail 'falha ao gerar token de verificação FPM'
[[ "$FPM_TOKEN" =~ ^[0-9a-f]{64}$ ]] || fail 'token de verificação FPM inválido'

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

\$upRaw = ini_get('session.upload_progress.enabled');
\$up = \$upRaw === false ? null : strtolower(trim(\$upRaw));
\$upDisabled = \$upRaw !== false && in_array(\$up, ['', '0', 'off', 'false'], true);

\$pms = strtolower(trim((string) ini_get('post_max_size')));
\$pmsBounded = (\$pms !== '' && \$pms !== '-1' && \$pms !== '0');
if (\$pmsBounded) {
    \$u = substr(\$pms, -1); \$v = (int) \$pms;
    \$b = match (\$u) {
        'g' => \$v * 1024**3,
        'm' => \$v * 1024**2,
        'k' => \$v * 1024,
        default => \$v,
    };
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

# Validar sintaxe no PHP CLI antes de expor a sonda ao servidor web.
"$PHP_BIN" -l "$FPM_CHECK_FILE" >/dev/null || fail 'sonda PHP contém erro de sintaxe'

FPM_CACHE_BUSTER="$(openssl rand -hex 16)" \
    || fail 'falha ao gerar cache-buster de verificação FPM'
[[ "$FPM_CACHE_BUSTER" =~ ^[0-9a-f]{32}$ ]] || fail 'cache-buster FPM inválido'
FPM_CHECK_URL="$BASE_URL/$(basename "$FPM_CHECK_FILE")?fpm_probe=$FPM_CACHE_BUSTER"
FPM_HEADERS_FILE="$(mktemp "$TMP_DIR/gisley-fpm-headers.XXXXXX")" \
    || fail 'falha ao criar arquivo temporário de headers FPM'
FPM_BODY_FILE="$(mktemp "$TMP_DIR/gisley-fpm-body.XXXXXX")" \
    || fail 'falha ao criar arquivo temporário de corpo FPM'
FPM_CURL_CONFIG_FILE="$(mktemp "$TMP_DIR/gisley-fpm-curl.XXXXXX")" \
    || fail 'falha ao criar configuração temporária do curl FPM'
printf 'header = "X-FPM-Check-Token: %s"\n' "$FPM_TOKEN" > "$FPM_CURL_CONFIG_FILE"

# Faz várias sondas para observar workers diferentes. Uma resposta insegura
# bloqueia o deploy; não há fallback permissivo nem reset remoto de opcache.
for attempt in 1 2 3 4 5; do
    : > "$FPM_HEADERS_FILE"
    : > "$FPM_BODY_FILE"
    curl --fail --silent --show-error --max-time 15 \
        --dump-header "$FPM_HEADERS_FILE" \
        --output "$FPM_BODY_FILE" \
        --config "$FPM_CURL_CONFIG_FILE" \
        -H 'Cache-Control: no-cache' \
        -H 'Pragma: no-cache' \
        -H 'Accept: application/json' \
        "$FPM_CHECK_URL" \
        || fail "falha ao acessar o script de verificação FPM (tentativa $attempt)"

    grep -Eiq '^cache-control:[[:space:]]*[^\r\n]*no-store' "$FPM_HEADERS_FILE" \
        || fail "resposta FPM sem Cache-Control no-store (tentativa $attempt)"
    grep -Eiq '^content-type:[[:space:]]*application/json([;[:space:]]|$)' "$FPM_HEADERS_FILE" \
        || fail "resposta FPM sem Content-Type JSON (tentativa $attempt)"

    # O código PHP é deliberadamente literal; nenhum valor do shell deve ser
    # interpolado no parser que valida a resposta do FPM.
    # shellcheck disable=SC2016
    fpm_secure="$("$PHP_BIN" -r '
    $j = json_decode(stream_get_contents(STDIN), true);
    $secure = is_array($j)
        && ($j["secure"] ?? false) === true
        && ($j["patched"] ?? false) === true
        && ($j["upload_progress_disabled"] ?? false) === true
        && ($j["post_max_bounded"] ?? false) === true
        && in_array(($j["sapi"] ?? null), ["fpm-fcgi", "litespeed"], true);
    echo $secure ? "1" : "0";
    ' < "$FPM_BODY_FILE")" \
        || fail "não foi possível validar o corpo JSON do PHP web (tentativa $attempt)"
    [[ "$fpm_secure" == "1" ]] || {
        printf 'deploy-hostgator: runtime PHP web não passou no gate PHP2Shell.\n' >&2
        fail 'Versão, diretivas ou SAPI do PHP web incompatíveis com a política de segurança. Abortando deploy.'
    }
    printf 'PHP web security check %d/5 OK\n' "$attempt"
done

rm -f "$FPM_CHECK_FILE"
FPM_CHECK_FILE=''

# Keep release diagnostics tied to the exact commit being deployed. The values
# are embedded in Laravel's config cache and never depend on the web worker's
# ability to execute Git or read the repository at request time.
export APP_RELEASE_SHA="$DEPLOY_SHA"
export APP_RELEASE_BUILT_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
export APP_ASSET_VERSION="${DEPLOY_SHA:0:12}"

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
"$PHP_BIN" artisan app:assert-migrations-current --no-ansi

HEALTH_CACHE_BUSTER="$(openssl rand -hex 16)" || fail 'falha ao gerar cache-buster do health check'
if [[ "$HEALTH_URL" == *\?* ]]; then
    HEALTH_CHECK_URL="${HEALTH_URL}&deploy_probe=$HEALTH_CACHE_BUSTER"
else
    HEALTH_CHECK_URL="${HEALTH_URL}?deploy_probe=$HEALTH_CACHE_BUSTER"
fi
health_body="$(curl --fail --silent --show-error --location --max-time 15 \
    -H 'Cache-Control: no-cache, no-store' -H 'Pragma: no-cache' \
    "$HEALTH_CHECK_URL")" || fail 'health check falhou'
[[ "$health_body" == '{"status":"ok"}' ]] || fail 'health check retornou corpo inesperado'

printf 'deploy validado: %s\n' "$DEPLOY_SHA"
