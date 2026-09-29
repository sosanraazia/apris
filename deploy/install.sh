#!/usr/bin/env bash
# First-time install on Ubuntu 22.04/24.04. Run once as root:
#   sudo DOMAIN=apris.se.dsu.edu.pk REPO=git@github.com:sosanraazia/apris.git CERT_EMAIL=you@dsu.edu.pk bash install.sh
# Re-running is safe: existing env file, keys, database and certificates are kept.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }

DOMAIN="${DOMAIN:-apris.se.dsu.edu.pk}"
REPO="${REPO:-git@github.com:sosanraazia/apris.git}"
BRANCH="${APRIS_BRANCH:-main}"
CERT_EMAIL="${CERT_EMAIL:-}"
BASE=/opt/apris; DATA=/var/lib/apris

echo "==> Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx sqlite3 build-essential openssl certbot util-linux ufw fail2ban unattended-upgrades
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> Firewall (SSH, HTTP, HTTPS only) and brute-force protection"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true

echo "==> User and directories"
id apris >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /usr/sbin/nologin apris
mkdir -p "$BASE/releases" "$DATA/storage" "$DATA/backups" /etc/apris /var/backups/apris
chown -R apris:apris "$BASE" "$DATA"; chmod 750 "$DATA"; chmod 700 /var/backups/apris

echo "==> Environment file"
if [ ! -f /etc/apris/apris.env ]; then
  ADMIN_PW="${INITIAL_ADMIN_PASSWORD:-}"
  if [ -z "$ADMIN_PW" ]; then read -r -s -p "Choose the initial admin password (12+ chars): " ADMIN_PW; echo; fi
  [ "${#ADMIN_PW}" -ge 12 ] || { echo "Password too short"; exit 1; }
  cat > /etc/apris/apris.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_DOMAIN=$DOMAIN
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
DATABASE_URL=file:$DATA/apris.db
STORAGE_DIR=$DATA/storage
INITIAL_ADMIN_PASSWORD=$ADMIN_PW
EOF
  chown root:apris /etc/apris/apris.env; chmod 640 /etc/apris/apris.env
fi

echo "==> GitHub deploy key (read-only)"
SSH_DIR="$BASE/.ssh"
sudo -u apris mkdir -p "$SSH_DIR"; chmod 700 "$SSH_DIR"
[ -f "$SSH_DIR/id_ed25519" ] || sudo -u apris ssh-keygen -q -t ed25519 -N "" -C "apris-deploy@$DOMAIN" -f "$SSH_DIR/id_ed25519"
sudo -u apris bash -c "ssh-keyscan -t ed25519 github.com >> '$SSH_DIR/known_hosts' 2>/dev/null; sort -u '$SSH_DIR/known_hosts' -o '$SSH_DIR/known_hosts'"
if ! sudo -u apris ssh -o BatchMode=yes -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo
  echo "Add this public key as a READ-ONLY deploy key to the repo"
  echo "(GitHub → repo → Settings → Deploy keys → Add deploy key; leave 'Allow write access' OFF):"
  echo; cat "$SSH_DIR/id_ed25519.pub"; echo
  read -r -p "Press Enter once the key is added... " _
fi

echo "==> Clone"
[ -d "$BASE/repo.git" ] || sudo -u apris git clone --bare --quiet "$REPO" "$BASE/repo.git"
sudo -u apris git --git-dir="$BASE/repo.git" fetch --quiet origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"

echo "==> systemd, sudoers, scripts"
show() { git --git-dir="$BASE/repo.git" show "$BRANCH:$1"; }
for f in apris.service apris-deploy.service apris-deploy.timer apris-backup.service apris-backup.timer; do show "deploy/$f" > "/etc/systemd/system/$f"; done
show deploy/deploy.sh > "$BASE/deploy.sh"; chown apris:apris "$BASE/deploy.sh"; chmod 755 "$BASE/deploy.sh"
cat > /etc/sudoers.d/apris <<'EOF'
apris ALL=(root) NOPASSWD: /usr/bin/systemctl restart apris
apris ALL=(root) NOPASSWD: /bin/systemctl restart apris
EOF
chmod 440 /etc/sudoers.d/apris; visudo -cf /etc/sudoers.d/apris >/dev/null
systemctl daemon-reload
systemctl enable apris >/dev/null 2>&1

echo "==> First build and start (takes a few minutes)"
sudo -u apris "$BASE/deploy.sh"
# The initial admin password has done its job — don't leave it on disk. (The admin must change it at first login.)
sed -i '/^INITIAL_ADMIN_PASSWORD=/d' /etc/apris/apris.env
systemctl enable --now apris-deploy.timer apris-backup.timer

echo "==> nginx + HTTPS"
CONF=/etc/nginx/sites-available/apris
show deploy/nginx-apris.conf | sed "s/DOMAIN/$DOMAIN/g" > "$CONF"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  if [ -n "$CERT_EMAIL" ]; then
    systemctl stop nginx || true
    certbot certonly --standalone -d "$DOMAIN" -m "$CERT_EMAIL" --agree-tos --non-interactive \
      || echo "!! certbot failed (is $DOMAIN pointing at this VM, port 80 reachable?). Put the university-issued certificate at the paths in $CONF instead."
  else
    echo "!! No CERT_EMAIL given and no certificate found. Either re-run with CERT_EMAIL=..., or install the university-issued certificate at the paths in $CONF."
  fi
fi
ln -sf "$CONF" /etc/nginx/sites-enabled/apris; rm -f /etc/nginx/sites-enabled/default
if nginx -t 2>/dev/null; then systemctl enable --now nginx; systemctl reload nginx; else echo "!! nginx config not valid yet (certificate missing?) — fix and run: nginx -t && systemctl reload nginx"; fi

echo
echo "Done. App: https://$DOMAIN   Health: curl -s http://127.0.0.1:3000/api/health"
echo "Log in as 'admin' with the initial password (you will be asked to change it), then create users under Admin → Manage users."
