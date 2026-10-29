#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy-hostgator.sh"
TEST_ROOT="$(mktemp -d)"
PROJECT_ROOT="$TEST_ROOT/project"
MOCK_BIN="$TEST_ROOT/bin"
TMP_DIR="$TEST_ROOT/tmp"
GIT_STATE="$TEST_ROOT/git-checked-out"
CURL_AUDIT_FILE="$TEST_ROOT/curl-audit"
REAL_PHP_BIN="$(command -v php || true)"

cleanup() {
    rm -rf -- "$TEST_ROOT"
}

trap cleanup EXIT HUP INT TERM

mkdir -p "$PROJECT_ROOT/public" "$PROJECT_ROOT/storage" "$PROJECT_ROOT/bootstrap/cache" "$MOCK_BIN" "$TMP_DIR"
touch "$PROJECT_ROOT/public/.user.ini"

cat > "$MOCK_BIN/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-} ${2:-}" in
    'status --porcelain') exit 0 ;;
    'branch --show-current') printf '%s\n' "$DEPLOY_BRANCH" ;;
    'rev-parse origin/'*) printf '%s\n' "$DEPLOY_SHA" ;;
    'rev-parse HEAD')
        if [[ -e "$GIT_STATE" ]]; then
            printf '%s\n' "$DEPLOY_SHA"
        else
            printf '%s\n' '1111111111111111111111111111111111111111'
        fi
        ;;
    'checkout --detach') touch "$GIT_STATE" ;;
    'cat-file -e'|'merge-base --is-ancestor'|'fetch --prune'|'show-ref --verify') exit 0 ;;
    *) exit 0 ;;
esac
MOCK

cat > "$MOCK_BIN/composer" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat > "$MOCK_BIN/php" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == '-r' ]]; then
    if [[ -n "${REAL_PHP_BIN:-}" ]]; then
        exec "$REAL_PHP_BIN" "$@"
    fi
    cat >/dev/null
    if [[ "${CURL_MODE:-success}" == 'bad-body' || "${CURL_MODE:-success}" == 'unsafe-flags' ]]; then
        printf '0'
    else
        printf '1'
    fi
fi
MOCK

cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

trap 'exit 143' HUP INT TERM

headers=''
body=''
url=''
for ((index = 1; index <= $#; index++)); do
    arg="${!index}"
    case "$arg" in
        --dump-header) next=$((index + 1)); headers="${!next}" ;;
        --output) next=$((index + 1)); body="${!next}" ;;
        --config) next=$((index + 1)); : "${!next}" ;;
        *'fpm_probe='*)
            url="$arg"
            printf 'cache_buster=present\n' >> "$CURL_AUDIT_FILE"
            ;;
        'Cache-Control: no-cache') printf 'request_cache_control=present\n' >> "$CURL_AUDIT_FILE" ;;
        'Pragma: no-cache') printf 'request_pragma=present\n' >> "$CURL_AUDIT_FILE" ;;
        https://*) url="$arg" ;;
    esac
done

if [[ "$url" == *'fpm_probe='* ]]; then
    if [[ "${CURL_MODE:-success}" == 'block' ]]; then
        while :; do sleep 1; done
    fi

    printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store, private\r\n\r\n' > "$headers"
    if [[ "${CURL_MODE:-success}" == 'bad-body' ]]; then
        printf '%s' '{"php_version":"8.2.35","sapi":"cgi-fcgi","patched":true,"upload_progress_disabled":true,"post_max_bounded":true,"secure":true}' > "$body"
    elif [[ "${CURL_MODE:-success}" == 'litespeed' ]]; then
        printf '%s' '{"php_version":"8.3.36","sapi":"litespeed","patched":true,"upload_progress_disabled":true,"post_max_bounded":true,"secure":true}' > "$body"
    elif [[ "${CURL_MODE:-success}" == 'unsafe-flags' ]]; then
        printf '%s' '{"php_version":"8.3.36","sapi":"litespeed","patched":true,"upload_progress_disabled":false,"post_max_bounded":true,"secure":false}' > "$body"
    else
        printf '%s' '{"php_version":"8.2.35","sapi":"fpm-fcgi","patched":true,"upload_progress_disabled":true,"post_max_bounded":true,"secure":true}' > "$body"
    fi
else
    printf '%s' '{"status":"ok"}'
fi
MOCK

chmod +x "$MOCK_BIN"/*

# PHP ini_get() representa boolean Off como string vazia ou "0". O gate deve
# aceitar ambas as formas, mas continuar rejeitando uma diretiva inexistente
# (ini_get() === false).
php_dollar='$'
grep -Fq "${php_dollar}upRaw = ini_get('session.upload_progress.enabled');" "$DEPLOY_SCRIPT"
grep -Fq "${php_dollar}up = ${php_dollar}upRaw === false ? null : strtolower(trim(${php_dollar}upRaw));" "$DEPLOY_SCRIPT"
grep -Fq "${php_dollar}upDisabled = ${php_dollar}upRaw !== false && in_array(${php_dollar}up, ['', '0', 'off', 'false'], true);" "$DEPLOY_SCRIPT"

assert_absent() {
    if compgen -G "$1" >/dev/null; then
        printf 'unexpected file: %s\n' "$1" >&2
        exit 1
    fi
}

run_deploy() {
    env \
        PATH="$MOCK_BIN:$PATH" \
        ALLOW_HOSTGATOR_DEPLOY=1 \
        DEPLOY_BRANCH='migration/laravel-backend-2026-10-02' \
        DEPLOY_SHA='2222222222222222222222222222222222222222' \
        PROJECT_ROOT="$PROJECT_ROOT" \
        LOCK_DIR="$PROJECT_ROOT/.deploy-lock" \
        DEPLOY_STATE_FILE="$PROJECT_ROOT/.deploy-state" \
        TMPDIR="$TMP_DIR" \
        COMPOSER_BIN="$MOCK_BIN/composer" \
        PHP_BIN="$MOCK_BIN/php" \
        HEALTH_URL='https://staging.example.test/health/live' \
        RUN_MIGRATIONS=0 \
        GIT_STATE="$GIT_STATE" \
        CURL_AUDIT_FILE="$CURL_AUDIT_FILE" \
        CURL_MODE="${CURL_MODE:-success}" \
        REAL_PHP_BIN="$REAL_PHP_BIN" \
        setsid bash "$DEPLOY_SCRIPT"
}

run_deploy_signal() {
    export PATH="$MOCK_BIN:$PATH"
    export ALLOW_HOSTGATOR_DEPLOY=1
    export DEPLOY_BRANCH='migration/laravel-backend-2026-10-02'
    export DEPLOY_SHA='2222222222222222222222222222222222222222'
    export PROJECT_ROOT LOCK_DIR DEPLOY_STATE_FILE TMPDIR COMPOSER_BIN PHP_BIN HEALTH_URL RUN_MIGRATIONS
    export GIT_STATE CURL_AUDIT_FILE CURL_MODE REAL_PHP_BIN
    LOCK_DIR="$PROJECT_ROOT/.deploy-lock"
    DEPLOY_STATE_FILE="$PROJECT_ROOT/.deploy-state"
    TMPDIR="$TMP_DIR"
    COMPOSER_BIN="$MOCK_BIN/composer"
    PHP_BIN="$MOCK_BIN/php"
    HEALTH_URL='https://staging.example.test/health/live'
    RUN_MIGRATIONS=0
    exec setsid bash "$DEPLOY_SCRIPT"
}

run_deploy
assert_absent "$PROJECT_ROOT/public/.fpm_sec_check.*.php"
assert_absent "$TMP_DIR/gisley-fpm-*"
test ! -e "$PROJECT_ROOT/.deploy-lock"
grep -q '^request_cache_control=present$' "$CURL_AUDIT_FILE"
grep -q '^request_pragma=present$' "$CURL_AUDIT_FILE"
grep -q '^cache_buster=present$' "$CURL_AUDIT_FILE"

# LSAPI é permitido somente com todos os controles de PHP2Shell satisfeitos.
CURL_MODE=litespeed run_deploy
assert_absent "$PROJECT_ROOT/public/.fpm_sec_check.*.php"
assert_absent "$TMP_DIR/gisley-fpm-*"
test ! -e "$PROJECT_ROOT/.deploy-lock"

set +e
CURL_MODE=bad-body run_deploy >/dev/null 2>"$TEST_ROOT/bad-body.err"
bad_body_status=$?
set -e
test "$bad_body_status" -ne 0
assert_absent "$PROJECT_ROOT/public/.fpm_sec_check.*.php"
assert_absent "$TMP_DIR/gisley-fpm-*"
test ! -e "$PROJECT_ROOT/.deploy-lock"

set +e
CURL_MODE=unsafe-flags run_deploy >/dev/null 2>"$TEST_ROOT/unsafe-flags.err"
unsafe_flags_status=$?
set -e
test "$unsafe_flags_status" -ne 0
assert_absent "$PROJECT_ROOT/public/.fpm_sec_check.*.php"
assert_absent "$TMP_DIR/gisley-fpm-*"
test ! -e "$PROJECT_ROOT/.deploy-lock"

set +e
CURL_MODE=block run_deploy_signal >/dev/null 2>"$TEST_ROOT/interrupted.err" &
deploy_pid=$!
for _ in {1..20}; do
    if compgen -G "$PROJECT_ROOT/public/.fpm_sec_check.*.php" >/dev/null; then
        break
    fi
    sleep 0.1
done
kill -TERM -- "-$deploy_pid" 2>/dev/null || kill -TERM "$deploy_pid"
wait "$deploy_pid"
interrupted_status=$?
set -e
test "$interrupted_status" -eq 143
# setsid pode retornar antes do trap do shell que executa o curl bloqueado;
# aguarde brevemente a limpeza assíncrona, sem ignorar resíduos persistentes.
for _ in {1..30}; do
    if ! compgen -G "$PROJECT_ROOT/public/.fpm_sec_check.*.php" >/dev/null &&
       ! compgen -G "$TMP_DIR/gisley-fpm-*" >/dev/null &&
       [[ ! -e "$PROJECT_ROOT/.deploy-lock" ]]; then
        break
    fi
    sleep 0.1
done
assert_absent "$PROJECT_ROOT/public/.fpm_sec_check.*.php"
assert_absent "$TMP_DIR/gisley-fpm-*"
test ! -e "$PROJECT_ROOT/.deploy-lock"

printf 'deploy-hostgator probe tests: PASS\n'
