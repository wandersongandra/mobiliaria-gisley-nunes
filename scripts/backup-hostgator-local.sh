#!/usr/bin/env bash
set -euo pipefail

# Private, same-host backup for the HostGator account. This is NOT disaster
# recovery: loss/compromise of the hosting account also affects these copies.
if [[ $# -ne 1 || ( "$1" != '--check' && "$1" != '--run' && "$1" != '--verify-latest' ) ]]; then
  echo 'Usage: backup-hostgator-local.sh --check|--run|--verify-latest' >&2
  exit 2
fi

umask 077
mode="$1"
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
public_root="${project_root}/public"
output_dir="${GISELY_LOCAL_BACKUP_DIR:-}"
media_root="${GISELY_LOCAL_BACKUP_MEDIA_ROOT:-${project_root}/storage/app/private/media}"
defaults_file="${GISELY_LOCAL_BACKUP_MYSQL_DEFAULTS_FILE:-}"
database="${GISELY_LOCAL_BACKUP_DATABASE:-}"
retention="${GISELY_LOCAL_BACKUP_KEEP:-7}"
automatic_mysql_config=false

fail() { echo "Local backup: $1" >&2; exit 1; }

[[ "$output_dir" == /* && -d "$output_dir" && ! -L "$output_dir" ]] || fail 'backup directory must exist and be absolute (not a symlink)'
[[ "$media_root" == /* && -d "$media_root" && ! -L "$media_root" ]] || fail 'private media directory missing or symbolic link'
[[ "$database" =~ ^[a-zA-Z0-9_]{1,64}$ ]] || fail 'database name is invalid'
[[ "$retention" =~ ^[1-9][0-9]?$ ]] || fail 'retention must be between 1 and 99 complete sets'

if [[ -z "$defaults_file" ]]; then
  automatic_mysql_config=true
  [[ -f "${project_root}/vendor/autoload.php" ]] || fail 'Laravel vendor directory missing for automatic MySQL configuration'
  [[ -f "${project_root}/scripts/setup-hostgator-local-db.php" ]] || fail 'automatic MySQL configuration helper missing'
  command -v php >/dev/null 2>&1 || fail 'PHP CLI is unavailable'
else
  [[ "$defaults_file" == /* && -f "$defaults_file" && ! -L "$defaults_file" ]] || fail 'private MySQL defaults file missing or symbolic link'
fi

output_dir="$(cd -- "$output_dir" && pwd -P)"
media_root="$(cd -- "$media_root" && pwd -P)"
if [[ "$automatic_mysql_config" == false ]]; then
  defaults_file="$(cd -- "$(dirname -- "$defaults_file")" && pwd -P)/$(basename -- "$defaults_file")"
fi

[[ "$output_dir" != "$project_root" && "$output_dir" != "$project_root/"* ]] || fail 'backups must be outside the application checkout'
[[ "$output_dir" != "$media_root" && "$output_dir" != "$media_root/"* ]] || fail 'backups must be outside private media'
[[ "$media_root" != "$public_root" && "$media_root" != "$public_root/"* ]] || fail 'media must not be in the public document root'
[[ "$(stat -c '%a' -- "$output_dir")" == '700' ]] || fail 'backup directory must have permissions 700'
if [[ "$automatic_mysql_config" == false ]]; then
  [[ "$defaults_file" != "$public_root/"* ]] || fail 'MySQL configuration must not be publicly accessible'
  [[ "$defaults_file" != "$output_dir/"* ]] || fail 'MySQL configuration must not be included in backups'
  [[ "$(stat -c '%a' -- "$defaults_file")" == '600' || "$(stat -c '%a' -- "$defaults_file")" == '400' ]] || fail 'MySQL configuration must have permissions 600 or 400'
fi
[[ -w "$output_dir" ]] || fail 'backup directory is not writable'

for executable in mysqldump gzip tar sha256sum stat mktemp find sort df awk mv rm; do
  command -v "$executable" >/dev/null 2>&1 || fail "required executable not installed: $executable"
done

# Never follow symlinks out of the private media tree when archiving uploads.
[[ -z "$(find "$media_root" -type l -print -quit)" ]] || fail 'private media contains a symlink; inspect it before backing up'

verify_set() {
  local set_dir="$1"
  [[ -d "$set_dir" && ! -L "$set_dir" ]] || fail 'missing backup set'
  [[ -f "$set_dir/complete.sha256" && -f "$set_dir/database.sql.gz" && -f "$set_dir/media.tar.gz" ]] || fail 'incomplete backup set'
  (cd -- "$set_dir" && sha256sum --status -c complete.sha256) || fail 'checksum mismatch'
  gzip -t -- "$set_dir/database.sql.gz" || fail 'database gzip invalid'
  tar -tzf "$set_dir/media.tar.gz" >/dev/null || fail 'media tar invalid'
}

if [[ "$mode" == '--check' ]]; then
  echo 'Local backup preflight: PASS (no production data read).'
  exit 0
fi

if [[ "$mode" == '--verify-latest' ]]; then
  latest=''
  while IFS= read -r candidate; do
    [[ -f "$candidate/complete.sha256" ]] && latest="$candidate"
  done < <(find "$output_dir" -mindepth 1 -maxdepth 1 -type d -name 'gisley-20??????T??????Z-*' | sort)
  [[ -n "$latest" ]] || fail 'no completed backup exists'
  verify_set "$latest"
  echo 'Latest local backup integrity: PASS.'
  exit 0
fi

# Reserve at least 512 MiB to limit disk-pressure damage to the live website.
available_kib="$(df -Pk -- "$output_dir" | awk 'END { print $4 }')"
[[ "$available_kib" =~ ^[0-9]+$ && "$available_kib" -ge 524288 ]] || fail 'less than 512 MiB free: refusing backup'

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_set="$(mktemp -d "${output_dir}/.gisley-${timestamp}-XXXXXX")"
cleanup() {
  if [[ -n "$temporary_set" && -d "$temporary_set" && "$temporary_set" == "$output_dir/.gisley-"* ]]; then
    rm -rf -- "$temporary_set"
  fi
}
trap cleanup EXIT

if [[ "$automatic_mysql_config" == true ]]; then
  defaults_file="${temporary_set}/mysql.cnf"
  php "${project_root}/scripts/setup-hostgator-local-db.php" "$defaults_file" >/dev/null
  [[ -f "$defaults_file" && "$(stat -c '%a' -- "$defaults_file")" == '600' ]] || fail 'automatic MySQL configuration was not created privately'
fi

mysqldump --defaults-extra-file="$defaults_file" \
  --single-transaction --quick --skip-lock-tables \
  --routines --events --triggers --default-character-set=utf8mb4 \
  -- "$database" | gzip -9 > "${temporary_set}/database.sql.gz"
if [[ "$automatic_mysql_config" == true ]]; then
  rm -- "$defaults_file"
fi

tar --directory="$media_root" -czf "${temporary_set}/media.tar.gz" .
[[ -s "${temporary_set}/database.sql.gz" && -s "${temporary_set}/media.tar.gz" ]] || fail 'empty archive'

(cd -- "$temporary_set" && sha256sum database.sql.gz media.tar.gz > complete.sha256)
verify_set "$temporary_set"

final_set="${output_dir}/gisley-${timestamp}-${temporary_set##*-}"
[[ ! -e "$final_set" ]] || fail 'destination backup set already exists'
mv -- "$temporary_set" "$final_set"
temporary_set=''

# Prune only this tool's fully validated, complete backup sets. Never delete
# an existing backup when the new one fails its checks.
completed=()
while IFS= read -r candidate; do
  [[ -L "$candidate" || ! -f "$candidate/complete.sha256" ]] && continue
  [[ "$(stat -c '%a' -- "$candidate")" == '700' ]] || continue
  completed+=("$candidate")
done < <(find "$output_dir" -mindepth 1 -maxdepth 1 -type d -name 'gisley-20??????T??????Z-*' | sort)

overage=$(( ${#completed[@]} - retention ))
if (( overage > 0 )); then
  for (( index = 0; index < overage; index++ )); do
    candidate="${completed[index]}"
    [[ "$candidate" == "$output_dir/gisley-20"* ]] || fail 'unsafe retention target'
    rm -rf -- "$candidate"
  done
fi

echo "Local backup created and verified: $(basename -- "$final_set")."
echo 'Warning: same-host backup does not protect against hosting account or disk loss.'
