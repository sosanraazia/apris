#!/usr/bin/env bash
# Nightly backup of the database and uploaded documents. Keeps 14 days.
set -euo pipefail
set -a; . /etc/apris/apris.env; set +a
DEST=/var/backups/apris; STAMP=$(date +%F)
mkdir -p "$DEST"; umask 077
sqlite3 "${DATABASE_URL#file:}" ".backup '$DEST/apris-$STAMP.db'"
tar -czf "$DEST/storage-$STAMP.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
find "$DEST" -type f -mtime +14 -delete
