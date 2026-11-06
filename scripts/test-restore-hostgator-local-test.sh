#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
restore_script="$script_dir/restore-hostgator-local-test.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -m 700 -- "$test_root/backups" "$test_root/media" "$test_root/restore-media" "$test_root/bin"
backup_set="$test_root/backups/gisley-20261106T100000Z-fixture"
mkdir -m 700 -- "$backup_set"
printf 'CREATE TABLE fixture (id INT);\n' | gzip -c > "$backup_set/database.sql.gz"
printf 'photo fixture\n' > "$test_root/media/photo.jpg"
tar -czf "$backup_set/media.tar.gz" -C "$test_root/media" .
(cd -- "$backup_set" && sha256sum database.sql.gz media.tar.gz > complete.sha256)
printf '[client]\nuser=fixture\npassword=fixture\n' > "$test_root/mysql.cnf"
chmod 600 -- "$test_root/mysql.cnf"

cat > "$test_root/bin/mysql" <<'MOCK_MYSQL'
#!/usr/bin/env bash
if [[ "$*" == *'--execute=SHOW TABLES'* ]]; then
  if [[ "${MYSQL_TEST_NONEMPTY:-0}" == 1 || -f "$MYSQL_TEST_IMPORTED" ]]; then
    printf 'fixture\n'
  fi
  exit 0
fi
cat > "$MYSQL_TEST_SQL"
touch -- "$MYSQL_TEST_IMPORTED"
MOCK_MYSQL
chmod 700 -- "$test_root/bin/mysql"

export PATH="$test_root/bin:$PATH"
export GISELY_RESTORE_SOURCE_SET="$backup_set"
export GISELY_RESTORE_MEDIA_DIR="$test_root/restore-media"
export GISELY_RESTORE_DATABASE='gisley77_restore_test'
export GISELY_LOCAL_BACKUP_DATABASE='gisley77_production'
export GISELY_RESTORE_MYSQL_DEFAULTS_FILE="$test_root/mysql.cnf"
export MYSQL_TEST_IMPORTED="$test_root/imported"
export MYSQL_TEST_SQL="$test_root/restored.sql"

bash "$restore_script" --check | grep -q 'PASS'
[[ ! -e "$MYSQL_TEST_IMPORTED" ]] || { echo 'FAIL: preflight modified database' >&2; exit 1; }

GISELY_RESTORE_DATABASE='gisley77_production' bash "$restore_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: production database accepted' >&2; exit 1;
}
GISELY_RESTORE_DATABASE='gisley77_test' bash "$restore_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: non-restore database accepted' >&2; exit 1;
}
MYSQL_TEST_NONEMPTY=1 bash "$restore_script" --run >/dev/null 2>&1 && {
  echo 'FAIL: existing test tables accepted' >&2; exit 1;
}
[[ ! -e "$MYSQL_TEST_IMPORTED" ]] || { echo 'FAIL: pre-existing tables overwritten' >&2; exit 1; }

printf 'tampered\n' >> "$backup_set/database.sql.gz"
bash "$restore_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: modified archive accepted' >&2; exit 1;
}
printf 'CREATE TABLE fixture (id INT);\n' | gzip -c > "$backup_set/database.sql.gz"
(cd -- "$backup_set" && sha256sum database.sql.gz media.tar.gz > complete.sha256)

ln -s -- "$test_root/mysql.cnf" "$test_root/media/unsafe-link"
tar -czf "$backup_set/media.tar.gz" -C "$test_root/media" .
(cd -- "$backup_set" && sha256sum database.sql.gz media.tar.gz > complete.sha256)
bash "$restore_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: symbolic archive entry accepted' >&2; exit 1;
}
rm -- "$test_root/media/unsafe-link"
tar -czf "$backup_set/media.tar.gz" -C "$test_root/media" .
(cd -- "$backup_set" && sha256sum database.sql.gz media.tar.gz > complete.sha256)

bash "$restore_script" --run | grep -q 'PASS'
grep -q 'CREATE TABLE fixture' "$MYSQL_TEST_SQL"
[[ "$(cat -- "$test_root/restore-media/photo.jpg")" == 'photo fixture' ]] || { echo 'FAIL: restored photo mismatch' >&2; exit 1; }

bash "$restore_script" --check >/dev/null 2>&1 && { echo 'FAIL: nonempty restore media accepted' >&2; exit 1; }

echo 'HostGator isolated restore guard and fixture smoke: PASS'
