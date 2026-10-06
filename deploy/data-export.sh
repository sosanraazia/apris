#!/usr/bin/env bash
# Run on the developer machine. Bundles the local database and uploaded documents into ONE encrypted file
# to carry to the VM (scp / USB). The file holds student records: NEVER commit it, never email it.
#   bash deploy/data-export.sh [output-file]
# The passphrase is asked for twice; for scripts set APRIS_DATA_PASSPHRASE instead.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DB:-prisma/dev.db}"
OUT="${1:-$HOME/apris-data-$(date +%F).tar.enc}"
[ -f "$DB" ] || { echo "No database at $DB" >&2; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
sqlite3 "$DB" ".backup '$TMP/apris.db'"   # a consistent copy, safe while the app is running
mkdir "$TMP/storage"; [ -d storage ] && cp -R storage/. "$TMP/storage/"
PASS_ARGS=(); [ -n "${APRIS_DATA_PASSPHRASE:-}" ] && PASS_ARGS=(-pass env:APRIS_DATA_PASSPHRASE)
tar -C "$TMP" -cf - apris.db storage | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt "${PASS_ARGS[@]}" -out "$OUT"
chmod 600 "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1)). Copy it to the VM with scp, then run deploy/data-import.sh there."
echo "Send the passphrase by a different channel than the file."
