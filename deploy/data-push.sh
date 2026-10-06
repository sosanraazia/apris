#!/usr/bin/env bash
# One command from the developer machine: export the local database + documents (encrypted), copy them to the VM over SSH,
# import them there, and delete the temporary files on both sides. REPLACES the VM's database (the old one is backed up first).
#   bash deploy/data-push.sh <ssh-user>@<vm-address>
# You type the passphrase twice (once here, once on the VM, because it is never stored or sent anywhere else).
# Overridable for testing: SUDO, REMOTE_IMPORT, DB.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:?usage: data-push.sh <ssh-user>@<vm-address>}"
SUDO="${SUDO-sudo}"
REMOTE_IMPORT="${REMOTE_IMPORT:-/opt/apris/current/deploy/data-import.sh}"   # the deployed release carries the import script
WORK=$(mktemp -d); BUNDLE="$WORK/apris-data.tar.enc"; trap 'rm -rf "$WORK"' EXIT
REMOTE="/tmp/apris-data-$(date +%s).tar.enc"

echo "1/3  Exporting (choose a passphrase)…"
bash deploy/data-export.sh "$BUNDLE"
echo "2/3  Copying to $TARGET …"
scp -q "$BUNDLE" "$TARGET:$REMOTE"
echo "3/3  Importing on the VM (type the same passphrase, then REPLACE)…"
ssh -t "$TARGET" "$SUDO bash $REMOTE_IMPORT $REMOTE; status=\$?; rm -f $REMOTE; exit \$status"
echo "Done. Sign in on the VM and reset or disable the dev accounts that came with the data."
