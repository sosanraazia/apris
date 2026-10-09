#!/usr/bin/env bash
# Run ON THE VM as root. Replaces the production database and uploaded documents with the contents of a file made by data-export.sh.
#   sudo bash data-import.sh /path/to/apris-data-YYYY-MM-DD.tar.enc
# The current database is backed up first. Overridable for testing: DATA, APP, ENVFILE, NO_SERVICE=1, YES=1.
set -euo pipefail
DATA="${DATA:-/var/lib/apris}"; APP="${APP:-/opt/apris/current}"; ENVFILE="${ENVFILE:-/etc/apris/apris.env}"
IN="${1:?usage: data-import.sh <file.tar.enc>}"
[ "$(id -u)" = 0 ] || [ -n "${NO_SERVICE:-}" ] || { echo "Run with sudo." >&2; exit 1; }
[ -f "$IN" ] || { echo "No such file: $IN" >&2; exit 1; }
if [ -z "${YES:-}" ]; then
  echo "This REPLACES the database and uploaded documents in $DATA with the contents of $IN."
  read -r -p "Type REPLACE to continue: " ans; [ "$ans" = "REPLACE" ] || { echo "Cancelled."; exit 1; }
fi
TMP=$(mktemp -d); chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
if [ -z "${APRIS_DATA_PASSPHRASE:-}" ]; then read -rs -p "Passphrase of the file: " APRIS_DATA_PASSPHRASE; echo; export APRIS_DATA_PASSPHRASE; fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:APRIS_DATA_PASSPHRASE -in "$IN" | tar -C "$TMP" -xf -
[ "$(sqlite3 "$TMP/apris.db" 'pragma integrity_check;')" = "ok" ] || { echo "The database in the file is damaged; nothing was changed." >&2; exit 1; }

mkdir -p "$DATA/backups" "$DATA/storage"
STAMP=$(date +%F-%H%M%S)
[ -n "${NO_SERVICE:-}" ] || systemctl stop apris
[ -f "$DATA/apris.db" ] && sqlite3 "$DATA/apris.db" ".backup '$DATA/backups/before-import-$STAMP.db'"
rm -f "$DATA/apris.db-wal" "$DATA/apris.db-shm"
cp "$TMP/apris.db" "$DATA/apris.db"
cp -R "$TMP/storage/." "$DATA/storage/"
if id apris >/dev/null 2>&1; then chown -R apris:apris "$DATA/apris.db" "$DATA/storage"; fi
chmod 600 "$DATA/apris.db"

if [ -z "${NO_SERVICE:-}" ]; then
  sudo -u apris bash -c "set -a; . '$ENVFILE'; cd '$APP' && npx prisma migrate deploy"   # bring an older database up to the deployed schema
  touch "$DATA/.seeded"                                                                   # the data already has its reference tables
  systemctl start apris
fi
echo "Imported."; [ -f "$DATA/backups/before-import-$STAMP.db" ] && echo "Previous database kept at $DATA/backups/before-import-$STAMP.db"
echo "NEXT: sign in, then reset the password of every account you do not recognise or disable it (dev accounts admin / hod / advisor came with the data):"
echo "  sudo -u apris bash -c \"set -a; . $ENVFILE; cd $APP && npm run admin:reset\""
