#!/usr/bin/env bash
set -euo pipefail

# Backups are never generated automatically by a deploy. Run --check first,
# then explicitly schedule --run only after testing an off-host restore.
if [[ $# -ne 1 || ( "$1" != '--check' && "$1" != '--run' ) ]]; then
  echo 'Usage: backup-hostgator-encrypted.sh --check|--run' >&2
  exit 2
fi

umask 077
backup_mode="$1"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
application_root="$(cd -- "${script_dir}/.." && pwd -P)"
public_root="$(cd -- "${application_root}/public" && pwd -P)"

backup_directory="${GISELY_BACKUP_OUTPUT_DIR:-}"
backup_media_directory="${GISELY_BACKUP_MEDIA_ROOT:-}"
backup_credentials="${GISELY_BACKUP_MYSQL_DEFAULTS_FILE:-}"
backup_database="${GISELY_BACKUP_DATABASE:-}"
backup_certificate="${GISELY_BACKUP_CERT_FILE:-}"
backup_certificate_fingerprint="${GISELY_BACKUP_CERT_SHA256:-}"

fail() { echo "Backup preflight failed: $1" >&2; exit 1; }

[[ "$backup_directory" == /* && -d "$backup_directory" ]] || fail 'output directory must exist and be absolute'
[[ "$backup_media_directory" == /* && -d "$backup_media_directory" ]] || fail 'media root must exist and be absolute'
[[ "$backup_credentials" == /* && -f "$backup_credentials" && -r "$backup_credentials" ]] || fail 'private MySQL defaults file is missing'
[[ "$backup_database" =~ ^[A-Za-z0-9_]+$ && ${#backup_database} -le 64 ]] || fail 'database name is invalid'
[[ "$backup_certificate" == /* && -f "$backup_certificate" && -r "$backup_certificate" ]] || fail 'public backup encryption certificate is missing'
[[ "$backup_certificate_fingerprint" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'certificate SHA-256 fingerprint is invalid'

backup_directory="$(cd -- "$backup_directory" && pwd -P)"
backup_media_directory="$(cd -- "$backup_media_directory" && pwd -P)"
backup_credentials_directory="$(cd -- "$(dirname -- "$backup_credentials")" && pwd -P)"
backup_credentials="${backup_credentials_directory}/$(basename -- "$backup_credentials")"
backup_certificate_directory="$(cd -- "$(dirname -- "$backup_certificate")" && pwd -P)"
backup_certificate="${backup_certificate_directory}/$(basename -- "$backup_certificate")"

[[ "$backup_directory" != "$public_root" && "$backup_directory" != "$public_root/"* ]] || fail 'backup output cannot be web-accessible'
[[ "$backup_media_directory" != "$public_root" && "$backup_media_directory" != "$public_root/"* ]] || fail 'media root cannot be web-accessible'
[[ "$backup_directory" != "$backup_media_directory" && "$backup_directory" != "$backup_media_directory/"* ]] || fail 'backup output cannot be inside the media root'
[[ -w "$backup_directory" ]] || fail 'backup output directory is not writable'
[[ ! -L "$backup_credentials" ]] || fail 'MySQL defaults file cannot be a symlink'
[[ "$backup_credentials" != "$public_root/"* ]] || fail 'MySQL defaults file cannot be web-accessible'
[[ ! -L "$backup_certificate" ]] || fail 'backup certificate cannot be a symlink'

credential_permissions="$(stat -c '%a' -- "$backup_credentials")"
[[ "$credential_permissions" == '600' || "$credential_permissions" == '400' ]] || fail 'MySQL defaults file must be chmod 600 or 400'

for executable in mysqldump openssl gzip tar sha256sum mktemp; do
  command -v "$executable" >/dev/null 2>&1 || fail "required command unavailable: $executable"
done

actual_certificate_fingerprint="$(openssl x509 -in "$backup_certificate" -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
[[ "${actual_certificate_fingerprint,,}" == "${backup_certificate_fingerprint,,}" ]] || fail 'backup certificate fingerprint mismatch'

if [[ "$backup_mode" == '--check' ]]; then
  echo 'Backup preflight: PASS (no backup created, no production data accessed).'
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_database=''
temporary_media=''
temporary_manifest=''

cleanup() {
  for temporary in "$temporary_database" "$temporary_media" "$temporary_manifest"; do
    if [[ -n "$temporary" && -f "$temporary" ]]; then
      rm -f -- "$temporary"
    fi
  done
}
trap cleanup EXIT

temporary_database="$(mktemp "${backup_directory}/gisley-${timestamp}-database-XXXXXXXX.partial")"
temporary_media="$(mktemp "${backup_directory}/gisley-${timestamp}-media-XXXXXXXX.partial")"
temporary_manifest="$(mktemp "${backup_directory}/gisley-${timestamp}-manifest-XXXXXXXX.partial")"

database_archive="${temporary_database%.partial}.sql.gz.cms"
media_archive="${temporary_media%.partial}.tar.gz.cms"
manifest="${temporary_manifest%.partial}.sha256"

# Credentials are supplied through an existing file outside public/. Never
# pass passwords in process arguments, export them, or write plaintext dumps.
mysqldump --defaults-extra-file="$backup_credentials" \
  --single-transaction --quick --routines --events --triggers \
  -- "$backup_database" \
  | gzip -9 \
  | openssl cms -encrypt -binary -outform DER -aes-256-cbc -recip "$backup_certificate" -out "$temporary_database"

tar --directory="$backup_media_directory" -czf - . \
  | openssl cms -encrypt -binary -outform DER -aes-256-cbc -recip "$backup_certificate" -out "$temporary_media"

[[ -s "$temporary_database" && -s "$temporary_media" ]] || fail 'an encrypted archive was empty'

mv -- "$temporary_database" "$database_archive"
mv -- "$temporary_media" "$media_archive"
(
  cd -- "$backup_directory"
  sha256sum -- "$(basename -- "$database_archive")" "$(basename -- "$media_archive")"
) > "$temporary_manifest"
mv -- "$temporary_manifest" "$manifest"

echo 'Encrypted SQL and media archives created with checksums.'
echo 'Not yet an off-site or restorable backup: transfer, verify and restore-test these archives separately.'
