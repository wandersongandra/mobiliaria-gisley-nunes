#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backup_script="${script_dir}/backup-hostgator-encrypted.sh"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p -- "$test_root/output" "$test_root/media" "$test_root/bin"
printf '%s\n' 'private media fixture' > "$test_root/media/photo.txt"
printf '[client]\nuser=fixture\npassword=fixture\n' > "$test_root/mysql.cnf"
chmod 600 -- "$test_root/mysql.cnf"

# Exercise real public-key encryption/decryption. Only mysqldump is stubbed:
# no production database exists in CI or the local developer environment.
printf '#!/usr/bin/env bash\nprintf "CREATE TABLE test (id INT);\\n"\n' > "$test_root/bin/mysqldump"
chmod 700 -- "$test_root/bin/mysqldump"
export PATH="${test_root}/bin:${PATH}"
openssl req -x509 -newkey rsa:3072 -nodes -days 2 \
  -keyout "$test_root/private.pem" -out "$test_root/public.pem" \
  -subj '/CN=Gisley Backup Fixture' >/dev/null 2>&1
fingerprint="$(openssl x509 -in "$test_root/public.pem" -outform DER | sha256sum | cut -d' ' -f1)"

export GISELY_BACKUP_OUTPUT_DIR="$test_root/output"
export GISELY_BACKUP_MEDIA_ROOT="$test_root/media"
export GISELY_BACKUP_MYSQL_DEFAULTS_FILE="$test_root/mysql.cnf"
export GISELY_BACKUP_DATABASE='gisley_fixture'
export GISELY_BACKUP_CERT_FILE="$test_root/public.pem"
export GISELY_BACKUP_CERT_SHA256="$fingerprint"

bash "$backup_script" --check | grep -q 'Backup preflight: PASS'

GISELY_BACKUP_CERT_SHA256="$(printf '%064d' 0)" bash "$backup_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: backup certificate fingerprint mismatch was accepted' >&2
  exit 1
}

chmod 644 -- "$test_root/mysql.cnf"
if bash "$backup_script" --check >/dev/null 2>&1; then
  echo 'FAIL: insecure permissions on credentials were accepted' >&2
  exit 1
fi
chmod 600 -- "$test_root/mysql.cnf"

GISELY_BACKUP_OUTPUT_DIR="$test_root/media" bash "$backup_script" --check >/dev/null 2>&1 && {
  echo 'FAIL: backup output inside the media root was accepted' >&2
  exit 1
}

bash "$backup_script" --run >/dev/null

shopt -s nullglob
database_files=("$test_root"/output/*database-*.sql.gz.cms)
media_files=("$test_root"/output/*media-*.tar.gz.cms)
manifests=("$test_root"/output/*manifest-*.sha256)
[[ ${#database_files[@]} -eq 1 && ${#media_files[@]} -eq 1 && ${#manifests[@]} -eq 1 ]] || {
  echo 'FAIL: incomplete encrypted backup set' >&2
  exit 1
}

(
  cd -- "$test_root/output"
  sha256sum -c -- "$(basename -- "${manifests[0]}")" >/dev/null
)

openssl cms -decrypt -inform DER -in "${database_files[0]}" \
  -recip "$test_root/public.pem" -inkey "$test_root/private.pem" \
  | gzip -dc | grep -q 'CREATE TABLE test'
openssl cms -decrypt -inform DER -in "${media_files[0]}" \
  -recip "$test_root/public.pem" -inkey "$test_root/private.pem" \
  | tar -xzOf - ./photo.txt | grep -q 'private media fixture'

printf '#!/usr/bin/env bash\nexit 9\n' > "$test_root/bin/mysqldump"
chmod 700 -- "$test_root/bin/mysqldump"
if bash "$backup_script" --run >/dev/null 2>&1; then
  echo 'FAIL: a failed database dump created a successful backup' >&2
  exit 1
fi
partial_files=("$test_root"/output/*.partial)
[[ ${#partial_files[@]} -eq 0 ]] || {
  echo 'FAIL: an interrupted backup left temporary files behind' >&2
  exit 1
}

echo 'Encrypted backup pipeline and restore smoke: PASS'
