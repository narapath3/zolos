#!/usr/bin/env bash
# ============================================================
# Zolos Map Server — one-shot VPS bootstrap (ReadyIDC, Ubuntu)
# ============================================================
# Installs Node 22 + pm2 + nginx + certbot, deploys server/, and puts it
# behind https://game.zolos.online (wss). Safe to re-run (idempotent).
#
#   sudo bash setup-vps.sh
#
# BEFORE running:
#   1) Point an A record  game.zolos.online -> <this VPS public IP>  and wait
#      for it to resolve (certbot needs it), otherwise skip SSL for now.
#   2) You'll be asked to fill server/.env (Supabase keys) if it's missing.
set -euo pipefail

# ---- Config (override via env, e.g. BRANCH=my-branch sudo -E bash ...) ------
DOMAIN="${DOMAIN:-game.zolos.online}"
APP_DIR="${APP_DIR:-/opt/zolos}"
REPO_URL="${REPO_URL:-https://github.com/narapath3/zolos.git}"   # add a PAT for private: https://<TOKEN>@github.com/...
BRANCH="${BRANCH:-main}"
LE_EMAIL="${LE_EMAIL:-admin@zolos.online}"   # Let's Encrypt expiry notices
# ----------------------------------------------------------------------------

log()  { echo -e "\n\033[1;36m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[!] $*\033[0m"; }

if [[ $EUID -ne 0 ]]; then echo "Run as root: sudo bash setup-vps.sh"; exit 1; fi

log "Updating apt + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw ca-certificates gnupg

log "Installing Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v || true)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

log "Installing pm2 globally"
npm i -g pm2

log "Fetching the repo into ${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  # Private repo: if this clone prompts/fails, set up a GitHub deploy key or
  # use a token URL (https://<TOKEN>@github.com/narapath3/zolos.git), or scp
  # the project up manually, then re-run.
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

log "Installing server dependencies (production only)"
cd "${APP_DIR}/server"
npm ci --omit=dev

if [[ ! -f "${APP_DIR}/server/.env" ]]; then
  cp "${APP_DIR}/server/.env.example" "${APP_DIR}/server/.env"
  warn "Created server/.env from the example — EDIT IT NOW with your real"
  warn "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, then re-run this script."
  warn "  nano ${APP_DIR}/server/.env"
  exit 1
fi

log "Starting the server under pm2"
pm2 start "${APP_DIR}/deploy/ecosystem.config.cjs" --update-env || pm2 restart zolos-server --update-env
pm2 save
# Make pm2 resurrect on reboot
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true
pm2 save

log "Configuring nginx reverse proxy"
apt-get install -y nginx
cp "${APP_DIR}/deploy/nginx-zolos.conf" /etc/nginx/sites-available/zolos
ln -sf /etc/nginx/sites-available/zolos /etc/nginx/sites-enabled/zolos
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "Configuring firewall (ufw)"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

log "Obtaining Let's Encrypt certificate for ${DOMAIN}"
apt-get install -y certbot python3-certbot-nginx
if certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LE_EMAIL}" --redirect; then
  log "SSL installed — https://${DOMAIN} is live"
else
  warn "certbot failed (DNS for ${DOMAIN} may not point here yet)."
  warn "Fix the A record, then run:  certbot --nginx -d ${DOMAIN} --redirect"
fi

log "Done. Health check:"
echo "  curl -s https://${DOMAIN}/ | head"
pm2 status
