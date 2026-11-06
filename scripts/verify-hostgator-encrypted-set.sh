#!/usr/bin/env bash
set -euo pipefail

# Run only on the trusted, off-host backup/restore machine. The private key
# must never be copied to the web host or passed through CI artifacts.
if [[ $# -ne 4 || "$1" != '--manifest' || "$3" != '--certificate' ]]; then
  echo 'Usage: verify-hostgator-encrypted-set.sh --manifest /absolute/path/set.sha256 --certificate /absolute/path/public.pem' >&2
  echo '       Set GISELY_RESTORE_PRIVATE_KEY to an absolute path for the optional decryption check.' >&2
  exit 2
fi

umask 077
manifest="$2"
certificate="$4"
private_key="${GISELY_RESTORE_PRIVATE_KEY:-}"

fail() { echo "Backup verification failed: $1" >&2; exit 1; }

for command_name in sha256sum openssl gzip tar; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

[[ "$manifest" == /* && -f "$manifest" && -r "$manifest" && ! -L "$manifest" ]] || fail 'manifest must be a readable regular file'
[[ "$certificate" == /* && -f "$certificate" && -r "$certificate" && ! -L "$certificate" ]] || fail 'certificate must be a readable regular file'

backup_dir="$(cd -- "$(dirname -- "$manifest")" && pwd -P)"
manifest_name="$(basename -- "$manifest")"
[[ "$manifest_name" =~ ^gisley-[0-9]{8}T[0-9]{6}Z-manifest-[[:alnum:]]+\.sha256$ ]] || fail 'unexpected manifest name'

mapfile -t entries < "$manifest"
[[ ${#entries[@]} -eq 2 ]] || fail 'manifest must list exactly two archives'

database_archive=''
media_archive=''
for entry in "${entries[@]}"; do
  [[ "$entry" =~ ^([a-fA-F0-9]{64})\ \ ([^/[:cntrl:]]+)$ ]] || fail 'malformed checksum entry'
  name="${BASH_REMATCH[2]}"
  [[ "$name" != *'..'* && "$name" != -* ]] || fail 'unsafe archive name'
  if [[ "$name" =~ ^gisley-([0-9]{8}T[0-9]{6}Z)-database-[[:alnum:]]+\.sql\.gz\.cms$ ]]; then
    [[ -z "$database_archive" ]] || fail 'duplicate database archive'
    database_archive="$name"
    database_timestamp="${BASH_REMATCH[1]}"
  elif [[ "$name" =~ ^gisley-([0-9]{8}T[0-9]{6}Z)-media-[[:alnum:]]+\.tar\.gz\.cms$ ]]; then
    [[ -z "$media_archive" ]] || fail 'duplicate media archive'
    media_archive="$name"
    media_timestamp="${BASH_REMATCH[1]}"
  else
    fail 'unexpected archive name'
  fi
  [[ -f "$backup_dir/$name" && ! -L "$backup_dir/$name" ]] || fail 'archive missing or symbolic link'
done

[[ -n "$database_archive" && -n "$media_archive" ]] || fail 'a required archive is missing'
[[ "$database_timestamp" == "$media_timestamp" ]] || fail 'archives came from different backup sets'
[[ "$manifest_name" == "gisley-${database_timestamp}-manifest-"* ]] || fail 'manifest timestamp differs from archives'

( cd -- "$backup_dir" && sha256sum --status --check -- "$manifest_name" ) || fail 'SHA-256 integrity check did not pass'
echo 'Backup integrity: PASS (two encrypted objects, checksum verified).'

if [[ -z "$private_key" ]]; then
  echo 'Decryption not checked: GISELY_RESTORE_PRIVATE_KEY is unset.'
  exit 0
fi

[[ "$private_key" == /* && -f "$private_key" && -r "$private_key" && ! -L "$private_key" ]] || fail 'private key must be a readable regular file'
openssl cms -decrypt -inform DER -in "$backup_dir/$database_archive" \
  -recip "$certificate" -inkey "$private_key" | gzip -t \
  || fail 'encrypted database cannot be decrypted and decompressed'
openssl cms -decrypt -inform DER -in "$backup_dir/$media_archive" \
  -recip "$certificate" -inkey "$private_key" | tar -tzf - >/dev/null \
  || fail 'encrypted media cannot be decrypted and read'

echo 'Backup decryption: PASS (SQL gzip and media tar streams readable; no plaintext files written).'
echo 'Still required: a real restore into an isolated database and private media directory.'
