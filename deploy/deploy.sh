#!/usr/bin/env bash
# Pull-based deploy. Run by apris-deploy.timer as user "apris" every 2 minutes (or by hand).
# Builds the new commit in its own release dir, and only switches over if it built, passed tests and answers /api/health.
# On any failure the previous release keeps running.
set -euo pipefail

BRANCH="${APRIS_BRANCH:-main}"
BASE=/opt/apris
REPO=$BASE/repo.git          # bare mirror of the private GitHub repo
DATA=/var/lib/apris
LOG=$DATA/deploy.log
HEALTH=http://127.0.0.1:3000/api/health
LOCK=$DATA/deploy.lock

umask 027
mkdir -p "$BASE/releases" "$DATA/backups"
exec 9>"$LOCK"; flock -n 9 || { echo "deploy already running"; exit 0; }
log() { echo "$(date -Is) $*" | tee -a "$LOG"; }

set -a; . /etc/apris/apris.env; set +a

git --git-dir="$REPO" fetch --quiet origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
NEW=$(git --git-dir="$REPO" rev-parse "$BRANCH")
CUR=$(basename "$(readlink -f "$BASE/current" 2>/dev/null || true)")
[ "$NEW" = "$CUR" ] && exit 0
if [ -f "$DATA/failed-sha" ] && [ "$(cat "$DATA/failed-sha")" = "$NEW" ]; then exit 0; fi  # don't retry a known-bad commit every 2 min

REL=$BASE/releases/$NEW
log "deploying $NEW (current: ${CUR:-none})"
fail() { log "DEPLOY FAILED at step: $1 — keeping $CUR"; echo "$NEW" > "$DATA/failed-sha"; rm -rf "$REL"; exit 1; }

rm -rf "$REL"; mkdir -p "$REL"
git --git-dir="$REPO" archive "$NEW" | tar -x -C "$REL"
cd "$REL"

npm ci --include=dev --no-audit --no-fund >>"$LOG" 2>&1            || fail "npm ci"
npx prisma generate >>"$LOG" 2>&1                      || fail "prisma generate"
npm test >>"$LOG" 2>&1                                 || fail "tests"
npm run build >>"$LOG" 2>&1                            || fail "build"

# Back up the database, then apply only new migrations (never resets data)
if [ -f "$DATA/apris.db" ]; then sqlite3 "$DATA/apris.db" ".backup '$DATA/backups/pre-$NEW.db'"; fi
npx prisma migrate deploy >>"$LOG" 2>&1                || fail "migrate"
[ -f "$DATA/.seeded" ] || { npm run seed:init >>"$LOG" 2>&1 && touch "$DATA/.seeded"; } || fail "seed:init"

# Switch and restart
PREV=$(readlink -f "$BASE/current" 2>/dev/null || true)
ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
sudo /bin/systemctl restart apris

for i in $(seq 1 30); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then
    rm -f "$DATA/failed-sha"
    log "deployed $NEW OK"
    cp "$REL/deploy/deploy.sh" "$BASE/deploy.sh.new" && chmod +x "$BASE/deploy.sh.new" && mv -f "$BASE/deploy.sh.new" "$BASE/deploy.sh"   # timer runs this stable copy
    ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r rm -rf   # keep the 3 newest releases
    find "$DATA/backups" -name 'pre-*.db' -mtime +30 -delete
    exit 0
  fi
  sleep 2
done

log "health check FAILED — rolling back"
if [ -n "$PREV" ] && [ -d "$PREV" ]; then ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"; sudo /bin/systemctl restart apris; fi
echo "$NEW" > "$DATA/failed-sha"
log "rolled back to ${PREV:-none}. Database backup taken before this deploy: $DATA/backups/pre-$NEW.db"
exit 1
