#!/usr/bin/env bash
# Run on the developer machine. Bundles the local database and uploaded documents into ONE encrypted file
# to carry to the VM (scp / USB). The file holds student records: NEVER commit it, never email it.
#   bash deploy/data-export.sh [output-file]
# The passphrase is asked for twice (8+ characters); for scripts set APRIS_DATA_PASSPHRASE instead.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DB:-prisma/dev.db}"
OUT="${1:-$HOME/apris-data-$(date +%F).tar.enc}"
[ -f "$DB" ] || { echo "No database at $DB" >&2; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
sqlite3 "$DB" ".backup '$TMP/apris.db'"   # a consistent copy, safe while the app is running
mkdir "$TMP/storage"; [ -d storage ] && cp -R storage/. "$TMP/storage/"
if [ -z "${APRIS_DATA_PASSPHRASE:-}" ]; then
  read -rs -p "Choose a passphrase for the file (8+ characters): " P1; echo
  read -rs -p "Repeat the passphrase: " P2; echo
  [ "$P1" = "$P2" ] || { echo "The passphrases differ; nothing was written." >&2; exit 1; }
  [ "${#P1}" -ge 8 ] || { echo "Use at least 8 characters; nothing was written." >&2; exit 1; }
  export APRIS_DATA_PASSPHRASE="$P1"
fi
tar -C "$TMP" -cf - apris.db storage | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:APRIS_DATA_PASSPHRASE -out "$OUT"
chmod 600 "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1)). Copy it to the VM with scp, then run deploy/data-import.sh there."
echo "Send the passphrase by a different channel than the file."
