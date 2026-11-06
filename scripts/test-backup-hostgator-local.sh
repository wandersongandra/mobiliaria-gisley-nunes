#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backup_script="${script_dir}/backup-hostgator-local.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p -- "$test_root/backups" "$test_root/media" "$test_root/bin"
chmod 700 -- "$test_root/backups" "$test_root/media" "$test_root/bin"
printf 'photo fixture\n' > "$test_root/media/photo.jpg"
printf '[client]\nuser=test\npassword=test\n' > "$test_root/mysql.cnf"
chmod 600 -- "$test_root/mysql.cnf"
printf '#!/usr/bin/env bash\n[[ " $* " == *" --no-tablespaces "* ]] || exit 9\nprintf "CREATE TABLE fixture (id INT);\\n"\n' > "$test_root/bin/mysqldump"
chmod 700 -- "$test_root/bin/mysqldump"

export PATH="${test_root}/bin:${PATH}"
export GISELY_LOCAL_BACKUP_DIR="$test_root/backups"
export GISELY_LOCAL_BACKUP_MEDIA_ROOT="$test_root/media"
export GISELY_LOCAL_BACKUP_MYSQL_DEFAULTS_FILE="$test_root/mysql.cnf"
export GISELY_LOCAL_BACKUP_DATABASE='gisley_test'
export GISELY_LOCAL_BACKUP_KEEP=7

bash "$backup_script" --check | grep -q 'PASS'
bash "$backup_script" --run | grep -q 'created and verified'
bash "$backup_script" --verify-latest | grep -q 'PASS'

shopt -s nullglob
sets=("$test_root"/backups/gisley-20*)
[[ ${#sets[@]} -eq 1 ]] || { echo 'FAIL: backup set missing' >&2; exit 1; }
gzip -dc -- "${sets[0]}/database.sql.gz" | grep -q 'CREATE TABLE fixture'
tar -xzOf "${sets[0]}/media.tar.gz" ./photo.jpg | grep -q 'photo fixture'
[[ "$(stat -c '%a' -- "${sets[0]}")" == 700 ]] || { echo 'FAIL: insecure backup permissions' >&2; exit 1; }

chmod 755 "$test_root/backups"
if bash "$backup_script" --check >/dev/null 2>&1; then
  echo 'FAIL: public-readable backup directory accepted' >&2
  exit 1
fi
chmod 700 "$test_root/backups"

chmod 644 "$test_root/mysql.cnf"
if bash "$backup_script" --check >/dev/null 2>&1; then
  echo 'FAIL: public-readable database credential accepted' >&2
  exit 1
fi
chmod 600 "$test_root/mysql.cnf"

ln -s "$test_root/mysql.cnf" "$test_root/media/unsafe-link"
if bash "$backup_script" --check >/dev/null 2>&1; then
  echo 'FAIL: symlink in private media accepted' >&2
  exit 1
fi
rm -- "$test_root/media/unsafe-link"

printf '#!/usr/bin/env bash\nexit 9\n' > "$test_root/bin/mysqldump"
chmod 700 "$test_root/bin/mysqldump"
if bash "$backup_script" --run >/dev/null 2>&1; then
  echo 'FAIL: failed mysqldump accepted' >&2
  exit 1
fi
partials=("$test_root"/backups/.gisley-*)
[[ ${#partials[@]} -eq 0 ]] || { echo 'FAIL: failed backup left incomplete files' >&2; exit 1; }

printf '#!/usr/bin/env bash\n[[ " $* " == *" --no-tablespaces "* ]] || exit 9\nprintf "CREATE TABLE fixture (id INT);\\n"\n' > "$test_root/bin/mysqldump"
chmod 700 "$test_root/bin/mysqldump"

# A successful backup prunes only old complete sets belonging to this script.
for day in 01 02 03 04 05 06 07 08; do
  fixture="$test_root/backups/gisley-202601${day}T000000Z-fixture"
  mkdir -m 700 -- "$fixture"
  cp -- "${sets[0]}/database.sql.gz" "${sets[0]}/media.tar.gz" "${sets[0]}/complete.sha256" "$fixture/"
done
mkdir -m 700 -- "$test_root/backups/keep-me"
bash "$backup_script" --run >/dev/null
sets=("$test_root"/backups/gisley-20*)
[[ ${#sets[@]} -eq 7 && -d "$test_root/backups/keep-me" ]] || {
  echo 'FAIL: retention deleted non-owned data or kept too many sets' >&2
  exit 1
}

# Corrupting the newest object must fail verification.
latest="${sets[${#sets[@]}-1]}"
printf 'corruption\n' >> "$latest/media.tar.gz"
if bash "$backup_script" --verify-latest >/dev/null 2>&1; then
  echo 'FAIL: corrupted archive passed verification' >&2
  exit 1
fi

echo 'HostGator same-host backup and retention smoke: PASS'
