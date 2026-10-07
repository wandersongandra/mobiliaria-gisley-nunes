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

fail() {
    printf 'deploy-hostgator: %s\n' "$1" >&2
    exit 1
}

cleanup() {
    rmdir "$LOCK_DIR" 2>/dev/null || true
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
"$PHP_BIN" artisan app:production-check

if [[ "$RUN_MIGRATIONS" == '1' ]]; then
    "$PHP_BIN" artisan migrate:status --no-ansi
    "$PHP_BIN" artisan migrate --force --no-ansi
else
    printf 'migrations não executadas; defina RUN_MIGRATIONS=1 em uma janela aprovada\n'
fi

"$PHP_BIN" artisan config:clear --no-ansi
"$PHP_BIN" artisan route:clear --no-ansi
"$PHP_BIN" artisan view:clear --no-ansi
"$PHP_BIN" artisan config:cache --no-ansi
"$PHP_BIN" artisan route:cache --no-ansi
"$PHP_BIN" artisan view:cache --no-ansi
"$PHP_BIN" artisan app:production-check

health_body="$(curl --fail --silent --show-error --location --max-time 15 "$HEALTH_URL")" || fail 'health check falhou'
[[ "$health_body" == '{"status":"ok"}' ]] || fail 'health check retornou corpo inesperado'

printf 'deploy validado: %s\n' "$DEPLOY_SHA"
