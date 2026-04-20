#!/usr/bin/env bash
# Cargoson Monitor – one-shot installer for Ubuntu/Debian VPS.
#
# Usage (as root):
#   curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
#     | DOMAIN=marcin.skalci.pl ADMIN_EMAIL=marcinbednarczyk9@gmail.com bash
#
# What it does:
#   - Installs Node.js 20, PostgreSQL 14+, nginx, certbot, pm2, git
#   - Creates system user `cargoson` and local Postgres DB
#   - Clones the repo to /opt/cargoson_monitor and builds the Next.js app
#   - Creates an admin user (ADMIN_EMAIL) with a freshly-generated password
#   - Serves the app on https://$DOMAIN via nginx + Let's Encrypt
#   - Runs the app with pm2 (auto-restart, boots on reboot)
#
# Re-running the script is safe: it upgrades dependencies, re-pulls main,
# re-seeds the admin (preserving the password you already set) and reloads pm2.

set -euo pipefail

DOMAIN="${DOMAIN:-${1:-}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-${2:-}}"
REPO_URL="${REPO_URL:-https://github.com/bednarczykm/cargoson_monitor.git}"
APP_DIR="${APP_DIR:-/opt/cargoson_monitor}"
APP_USER="${APP_USER:-cargoson}"
APP_PORT="${APP_PORT:-3000}"

if [[ -z "$DOMAIN" || -z "$ADMIN_EMAIL" ]]; then
  echo "ERROR: Set DOMAIN and ADMIN_EMAIL (env vars or args)." >&2
  echo "Example: DOMAIN=marcin.skalci.pl ADMIN_EMAIL=you@example.com bash install.sh" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root (use sudo)." >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "ERROR: Cannot detect OS (/etc/os-release missing)." >&2
  exit 1
fi
# shellcheck disable=SC1091
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *)
    echo "ERROR: This installer supports Ubuntu/Debian only. Detected: $PRETTY_NAME" >&2
    exit 1
    ;;
esac

echo
echo "=================================================="
echo "  Cargoson Monitor installer"
echo "  OS:     $PRETTY_NAME"
echo "  Domain: $DOMAIN"
echo "  Admin:  $ADMIN_EMAIL"
echo "  Path:   $APP_DIR"
echo "=================================================="
echo

export DEBIAN_FRONTEND=noninteractive

echo "==> 1/8  Updating apt and installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg \
  nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx \
  ufw openssl build-essential

echo
echo "==> 2/8  Installing Node.js 20 (if missing or older)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 20 ]]; then NEED_NODE=0; fi
fi
if [[ "$NEED_NODE" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

echo
echo "==> 3/8  Installing pm2 globally"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 -v || true

echo
echo "==> 4/8  Creating system user '$APP_USER' and cloning repo"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --all --quiet
  git -C "$APP_DIR" reset --hard origin/main
else
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo
echo "==> 5/8  Configuring PostgreSQL (database 'cargoson' owned by 'cargoson')"
systemctl enable --now postgresql

DB_PASS_FILE="/etc/cargoson-db.pass"
if [[ -f "$DB_PASS_FILE" ]]; then
  DB_PASS=$(cat "$DB_PASS_FILE")
else
  DB_PASS=$(openssl rand -hex 24)
  umask 077
  echo -n "$DB_PASS" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cargoson') THEN
    CREATE ROLE cargoson LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE cargoson WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='cargoson'" | grep -q 1; then
  sudo -u postgres createdb -O cargoson cargoson
fi

echo
echo "==> 6/8  Writing .env and building the Next.js app"

NEXTAUTH_SECRET_FILE="/etc/cargoson-nextauth.secret"
if [[ -f "$NEXTAUTH_SECRET_FILE" ]]; then
  NEXTAUTH_SECRET=$(cat "$NEXTAUTH_SECRET_FILE")
else
  NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
  umask 077
  echo -n "$NEXTAUTH_SECRET" > "$NEXTAUTH_SECRET_FILE"
  chmod 600 "$NEXTAUTH_SECRET_FILE"
fi

ADMIN_PASS_FILE="/etc/cargoson-admin.pass"
if [[ -f "$ADMIN_PASS_FILE" ]]; then
  ADMIN_PASSWORD=$(cat "$ADMIN_PASS_FILE")
  PASSWORD_IS_NEW=0
else
  # Readable password: 4 groups of 4 lowercase alnum
  ADMIN_PASSWORD=$(LC_ALL=C tr -dc 'a-z2-9' </dev/urandom | head -c 16 | sed 's/.\{4\}/&-/g; s/-$//')
  umask 077
  echo -n "$ADMIN_PASSWORD" > "$ADMIN_PASS_FILE"
  chmod 600 "$ADMIN_PASS_FILE"
  PASSWORD_IS_NEW=1
fi

cat > "$APP_DIR/nextjs_space/.env" <<ENV
DATABASE_URL='postgresql://cargoson:${DB_PASS}@127.0.0.1:5432/cargoson?connect_timeout=15'
NEXTAUTH_SECRET='${NEXTAUTH_SECRET}'
NEXTAUTH_URL='https://${DOMAIN}'
CARGOSON_API_KEY=''
ABACUSAI_API_KEY=''
WEB_APP_ID=''
NOTIF_ID_ALERT_CENOWY=''
NOTIF_ID_ALERT_CENOWY_CARGOSON=''
ENV
chown "$APP_USER":"$APP_USER" "$APP_DIR/nextjs_space/.env"
chmod 600 "$APP_DIR/nextjs_space/.env"

sudo -u "$APP_USER" env \
    ADMIN_EMAIL="$ADMIN_EMAIL" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    bash <<'APPBASH'
set -euo pipefail
cd /opt/cargoson_monitor/nextjs_space
export HOME=/home/cargoson
npm install --legacy-peer-deps --no-audit --no-fund
npx prisma generate
npx prisma db push --accept-data-loss
cat > /tmp/seed-admin.ts <<'TS'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()
async function main() {
  const email = process.env.ADMIN_EMAIL!
  const password = process.env.ADMIN_PASSWORD!
  const hash = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: { email, name: 'Admin', password: hash },
  })
  // Ensure default Settings row exists
  const existing = await prisma.settings.findFirst()
  if (!existing) {
    await prisma.settings.create({
      data: {
        tolerancePercent: 0,
        checkIntervalMinutes: 60,
        pauseStart: '23:00',
        pauseEnd: '05:00',
        alertEmail: email,
        monitoringEnabled: false,
        collectionPostcode: '10115',
        collectionCountry: 'DE',
      },
    })
  }
  console.log('admin seeded:', email)
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
TS
npx tsx /tmp/seed-admin.ts
rm -f /tmp/seed-admin.ts
npm run build
APPBASH

echo
echo "==> 7/8  Starting the app with pm2 and configuring nginx"

sudo -u "$APP_USER" env HOME=/home/cargoson bash <<APPBASH
set -euo pipefail
cd /opt/cargoson_monitor/nextjs_space
pm2 delete cargoson >/dev/null 2>&1 || true
PORT=$APP_PORT pm2 start npm --name cargoson -- start
pm2 save
APPBASH

# Install pm2 systemd unit so the app survives reboots
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/tmp/pm2-startup.sh || true
bash /tmp/pm2-startup.sh || true
rm -f /tmp/pm2-startup.sh

NGINX_CONF="/etc/nginx/sites-available/cargoson"
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cargoson
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Firewall – only open what we need; skip if ufw isn't installed
if command -v ufw >/dev/null 2>&1; then
  ufw --force allow OpenSSH || true
  ufw --force allow 'Nginx Full' || true
  if ! ufw status | grep -q "Status: active"; then
    ufw --force enable || true
  fi
fi

echo
echo "==> 8/8  Obtaining SSL certificate for $DOMAIN"
if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
      --email "$ADMIN_EMAIL" 2>&1; then
  echo
  echo "WARN: certbot failed. Check that $DOMAIN points to this server's IP."
  echo "      After fixing DNS re-run:  certbot --nginx -d $DOMAIN"
fi

echo
echo "=================================================="
echo "  DEPLOY DONE"
echo "=================================================="
echo "  URL:    https://${DOMAIN}"
echo "  Email:  ${ADMIN_EMAIL}"
if [[ "${PASSWORD_IS_NEW:-0}" -eq 1 ]]; then
  echo "  Pass:   ${ADMIN_PASSWORD}"
  echo
  echo "  Save this password — it is stored only in"
  echo "    $ADMIN_PASS_FILE  (chmod 600, root only)"
else
  echo "  Pass:   (unchanged; see $ADMIN_PASS_FILE)"
fi
echo
echo "  App status:  sudo -u $APP_USER pm2 status"
echo "  App logs:    sudo -u $APP_USER pm2 logs cargoson"
echo "  Reload app:  sudo -u $APP_USER pm2 restart cargoson"
echo "  Update app:  $(realpath "$0")   # re-run this script"
echo "=================================================="
