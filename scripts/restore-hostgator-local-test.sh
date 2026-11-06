#!/usr/bin/env bash
set -euo pipefail

# Test-only recovery. NEVER imports into the application's configured database
# or extracts files into its live storage. The target database must already
# exist, be empty and have a name containing "restore".
if [[ $# -ne 1 || ( "$1" != '--check' && "$1" != '--run' ) ]]; then
  echo 'Usage: restore-hostgator-local-test.sh --check|--run' >&2
  exit 2
fi

umask 077
mode="$1"
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_set="${GISELY_RESTORE_SOURCE_SET:-}"
media_target="${GISELY_RESTORE_MEDIA_DIR:-}"
restore_database="${GISELY_RESTORE_DATABASE:-}"
production_database="${GISELY_LOCAL_BACKUP_DATABASE:-}"
defaults_file="${GISELY_RESTORE_MYSQL_DEFAULTS_FILE:-}"
temporary_config_dir=''

fail() { echo "Isolated restore: $1" >&2; exit 1; }
cleanup() {
  if [[ -n "$temporary_config_dir" && -d "$temporary_config_dir" \
     && "$temporary_config_dir" == "$(dirname -- "$source_set")/.gisley-restore-"* ]]; then
    rm -rf -- "$temporary_config_dir"
  fi
}
trap cleanup EXIT

[[ "$source_set" == /* && -d "$source_set" && ! -L "$source_set" ]] || fail 'backup set must be an existing absolute directory, not a symlink'
[[ "$media_target" == /* && -d "$media_target" && ! -L "$media_target" ]] || fail 'media restore target must be an existing absolute directory, not a symlink'
[[ "$production_database" =~ ^[a-zA-Z0-9_]{1,64}$ ]] || fail 'production database name is required to prevent accidental overwrite'
[[ "$restore_database" =~ ^[a-zA-Z0-9_]{1,64}$ && "${restore_database,,}" == *restore* ]] || fail 'test database name must contain restore'
[[ "$restore_database" != "$production_database" ]] || fail 'refusing to restore into production database'

source_set="$(cd -- "$source_set" && pwd -P)"
media_target="$(cd -- "$media_target" && pwd -P)"
source_parent="$(dirname -- "$source_set")"

[[ "$(stat -c '%a' -- "$source_set")" == '700' ]] || fail 'backup set permissions must be 700'
[[ "$(stat -c '%a' -- "$media_target")" == '700' ]] || fail 'media restore directory permissions must be 700'
[[ "$(stat -c '%a' -- "$source_parent")" == '700' ]] || fail 'backup parent permissions must be 700'
[[ "$media_target" != "$project_root" && "$media_target" != "$project_root/"* ]] || fail 'restore media must be outside application checkout'
[[ "$media_target" != "$source_parent" && "$media_target" != "$source_parent/"* ]] || fail 'restore media must be outside backup directory'
[[ "$source_set" == "$source_parent/gisley-20"* ]] || fail 'backup set does not match local backup naming convention'
[[ -z "$(find "$media_target" -mindepth 1 -print -quit)" ]] || fail 'media restore directory must be completely empty'

for program in stat find sha256sum gzip tar cmp mysql wc mktemp; do
  command -v "$program" >/dev/null 2>&1 || fail "missing required executable: $program"
done

for filename in database.sql.gz media.tar.gz complete.sha256; do
  [[ -f "$source_set/$filename" && ! -L "$source_set/$filename" ]] || fail "missing or symbolic backup file: $filename"
done

# Recompute only the expected filenames. Never interpret arbitrary paths from
# an untrusted checksum manifest.
(cd -- "$source_set" && sha256sum database.sql.gz media.tar.gz | cmp -s - complete.sha256) || fail 'backup integrity check failed'
gzip -t -- "$source_set/database.sql.gz" || fail 'invalid database archive'
tar -tzf "$source_set/media.tar.gz" >/dev/null || fail 'invalid media archive'

while IFS= read -r entry; do
  [[ "$entry" == './' || "$entry" == './'* ]] || fail 'archive contains a non-relative path'
  [[ "/$entry/" != *'/../'* ]] || fail 'archive contains parent traversal'
done < <(tar -tzf "$source_set/media.tar.gz")

# The local backup producer refuses symlinks. Refuse special archive entries
# even if a backup set was later replaced or corrupted.
if tar -tvzf "$source_set/media.tar.gz" | grep -Eq '^[^d-]'; then
  fail 'archive contains a symlink or other special entry'
fi

if [[ -n "$defaults_file" ]]; then
  [[ "$defaults_file" == /* && -f "$defaults_file" && ! -L "$defaults_file" ]] || fail 'private MySQL configuration missing or symbolic link'
  [[ "$(stat -c '%a' -- "$defaults_file")" == '600' || "$(stat -c '%a' -- "$defaults_file")" == '400' ]] || fail 'MySQL configuration must be private'
  [[ "$defaults_file" != "$project_root/public/"* ]] || fail 'MySQL configuration is inside public directory'
else
  [[ -f "$project_root/vendor/autoload.php" && -f "$project_root/scripts/setup-hostgator-local-db.php" ]] || fail 'Laravel dependencies missing for automatic MySQL configuration'
  command -v php >/dev/null 2>&1 || fail 'PHP CLI unavailable for automatic MySQL configuration'
fi

if [[ "$mode" == '--check' ]]; then
  echo 'Isolated restore preflight: PASS (no database or media writes).'
  exit 0
fi

if [[ -z "$defaults_file" ]]; then
  temporary_config_dir="$(mktemp -d "${source_parent}/.gisley-restore-XXXXXX")"
  defaults_file="${temporary_config_dir}/mysql.cnf"
  php "$project_root/scripts/setup-hostgator-local-db.php" "$defaults_file" >/dev/null
  [[ -f "$defaults_file" && "$(stat -c '%a' -- "$defaults_file")" == '600' ]] || fail 'temporary MySQL options were not safely created'
fi

# The target must be an independently created, EMPTY database. This command
# will not CREATE/DROP databases, remove production data or touch live media.
if ! existing_tables="$(mysql --defaults-extra-file="$defaults_file" --batch --skip-column-names --execute='SHOW TABLES' "$restore_database")"; then
  fail 'test database is unavailable (create it separately and grant access)'
fi
[[ -z "$existing_tables" ]] || fail 'test database is not empty'

if ! gzip -dc -- "$source_set/database.sql.gz" | mysql --defaults-extra-file="$defaults_file" "$restore_database"; then
  fail 'database import failed; isolated target may contain partial data'
fi

table_names="$(mysql --defaults-extra-file="$defaults_file" --batch --skip-column-names --execute='SHOW TABLES' "$restore_database")" || fail 'could not inspect restored schema'
[[ -n "$table_names" ]] || fail 'restored database has no tables'
table_count="$(printf '%s\n' "$table_names" | wc -l | tr -d ' ')"

tar --extract --gzip --file="$source_set/media.tar.gz" --directory="$media_target" --no-same-owner --no-same-permissions || fail 'media extraction failed'
echo "Isolated restore: PASS (${table_count} table(s); media restored into private test directory)."
echo 'Production database and media paths were not modified by this script.'
