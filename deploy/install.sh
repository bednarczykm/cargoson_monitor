#!/usr/bin/env bash
# Cargoson Monitor – one-shot installer for Ubuntu/Debian VPS.
#
# Usage (as root, or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
#     | sudo DOMAIN=cargoson.example.pl ADMIN_EMAIL=you@example.com bash
#
# What it does:
#   - Installs Node.js 20, PostgreSQL, nginx, certbot (skips what's present)
#   - Creates system user `cargoson` and local Postgres DB
#   - Clones the repo to /opt/cargoson_monitor and builds the Next.js app
#   - Creates an admin user (ADMIN_EMAIL) with a generated password
#   - Serves the app on https://$DOMAIN via nginx + Let's Encrypt
#   - Runs the app via a systemd unit (auto-restart, survives reboots)
#
# Re-running the script is idempotent.

set -Eeuo pipefail

DOMAIN="${DOMAIN:-${1:-}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-${2:-}}"
REPO_URL="${REPO_URL:-https://github.com/bednarczykm/cargoson_monitor.git}"
APP_DIR="${APP_DIR:-/opt/cargoson_monitor}"
APP_USER="${APP_USER:-cargoson}"
APP_PORT="${APP_PORT:-3000}"
LOG_FILE="${LOG_FILE:-/var/log/cargoson-install.log}"

if [[ -z "$DOMAIN" || -z "$ADMIN_EMAIL" ]]; then
  echo "ERROR: Set DOMAIN and ADMIN_EMAIL (env vars or args)." >&2
  echo "  Example: DOMAIN=cargoson.example.pl ADMIN_EMAIL=you@ex.com bash install.sh" >&2
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

# Mirror all output to a log so nothing is lost
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

trap 'rc=$?; ln="${BASH_LINENO[0]:-?}"; echo; echo "ERROR: installer failed at line ${ln} (exit=${rc}). Full log: $LOG_FILE" >&2' ERR

echo
echo "=================================================="
echo "  Cargoson Monitor installer"
echo "  OS:     $PRETTY_NAME"
echo "  Domain: $DOMAIN"
echo "  Admin:  $ADMIN_EMAIL"
echo "  Path:   $APP_DIR"
echo "  Log:    $LOG_FILE"
echo "=================================================="
echo

export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7  Updating apt and installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg \
  nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx \
  ufw openssl build-essential

echo
echo "==> 2/7  Installing Node.js 20 (if missing or older)"
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
echo "==> 3/7  Creating system user '$APP_USER' and cloning repo"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
GIT_SAFE=(-c "safe.directory=$APP_DIR" -c "safe.directory=*")
if [[ -d "$APP_DIR/.git" ]]; then
  git "${GIT_SAFE[@]}" -C "$APP_DIR" fetch --all --quiet
  git "${GIT_SAFE[@]}" -C "$APP_DIR" reset --hard origin/main
else
  git "${GIT_SAFE[@]}" clone --quiet "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo
echo "==> 4/7  Configuring PostgreSQL (database 'cargoson' owned by 'cargoson')"
systemctl enable --now postgresql

DB_PASS_FILE="/etc/cargoson-db.pass"
if [[ -f "$DB_PASS_FILE" ]]; then
  DB_PASS=$(cat "$DB_PASS_FILE")
else
  DB_PASS=$(openssl rand -hex 24)
  ( umask 077; echo -n "$DB_PASS" > "$DB_PASS_FILE" )
  chmod 600 "$DB_PASS_FILE"
fi

PG_SCRIPT=$(mktemp --suffix=.sql)
chmod 644 "$PG_SCRIPT"   # psql runs as postgres user and must read this file
cat > "$PG_SCRIPT" <<SQL
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
sudo -u postgres psql -v ON_ERROR_STOP=1 -f "$PG_SCRIPT"
rm -f "$PG_SCRIPT"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='cargoson'" | grep -q 1; then
  sudo -u postgres createdb -O cargoson cargoson
fi

echo
echo "==> 5/7  Writing .env, installing Node deps, running migrations, seeding admin, building"

NEXTAUTH_SECRET_FILE="/etc/cargoson-nextauth.secret"
if [[ -f "$NEXTAUTH_SECRET_FILE" ]]; then
  NEXTAUTH_SECRET=$(cat "$NEXTAUTH_SECRET_FILE")
else
  NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
  ( umask 077; echo -n "$NEXTAUTH_SECRET" > "$NEXTAUTH_SECRET_FILE" )
  chmod 600 "$NEXTAUTH_SECRET_FILE"
fi

ADMIN_PASS_FILE="/etc/cargoson-admin.pass"
if [[ -f "$ADMIN_PASS_FILE" ]]; then
  ADMIN_PASSWORD=$(cat "$ADMIN_PASS_FILE")
  PASSWORD_IS_NEW=0
else
  # Readable password: 4 groups of 4 lowercase alnum. Generate without piping
  # to avoid any SIGPIPE / pipefail interactions.
  RAW_BYTES=$(head -c 128 /dev/urandom | base64 | tr -dc 'a-z2-9' || true)
  RAW="${RAW_BYTES:0:16}"
  if [[ ${#RAW} -ne 16 ]]; then
    echo "ERROR: failed to generate admin password (got '${RAW}')" >&2
    exit 1
  fi
  ADMIN_PASSWORD="${RAW:0:4}-${RAW:4:4}-${RAW:8:4}-${RAW:12:4}"
  ( umask 077; echo -n "$ADMIN_PASSWORD" > "$ADMIN_PASS_FILE" )
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

# Write seed script INSIDE nextjs_space so Node can find node_modules/@prisma/client
SEED_SCRIPT="$APP_DIR/nextjs_space/scripts/_seed-admin.ts"
cat > "$SEED_SCRIPT" <<'TS'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set')
  }
  const hash = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: { email, name: 'Admin', password: hash },
  })
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
  console.log(`admin upserted: ${email}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
TS
chown "$APP_USER":"$APP_USER" "$SEED_SCRIPT"

# Build as the cargoson user — script lives in /tmp, not inline, so stdin stays clean
BUILD_SCRIPT="/tmp/cargoson-build.sh"
cat > "$BUILD_SCRIPT" <<'BUILD'
#!/usr/bin/env bash
set -Eeuo pipefail
export HOME="/home/cargoson"
cd /opt/cargoson_monitor/nextjs_space

echo "    [build] npm install"
npm install --legacy-peer-deps --no-audit --no-fund --loglevel=error

echo "    [build] prisma generate"
npx prisma generate

echo "    [build] prisma db push"
npx prisma db push --accept-data-loss --skip-generate

echo "    [build] seed admin"
npx tsx scripts/_seed-admin.ts

echo "    [build] next build"
npm run build
BUILD
chmod +x "$BUILD_SCRIPT"
chown "$APP_USER":"$APP_USER" "$BUILD_SCRIPT"

sudo -u "$APP_USER" env \
  HOME="/home/$APP_USER" \
  ADMIN_EMAIL="$ADMIN_EMAIL" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash "$BUILD_SCRIPT"

rm -f "$BUILD_SCRIPT"

echo
echo "==> 6/7  Installing systemd unit and starting the app"

SERVICE_UNIT="/etc/systemd/system/cargoson.service"
cat > "$SERVICE_UNIT" <<UNIT
[Unit]
Description=Cargoson Monitor (Next.js)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/nextjs_space
Environment="NODE_ENV=production"
Environment="PORT=$APP_PORT"
Environment="HOSTNAME=127.0.0.1"
EnvironmentFile=$APP_DIR/nextjs_space/.env
ExecStart=/usr/bin/npm start --silent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
# Give the Next.js server a moment on boot before we consider the start failed
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable cargoson.service
systemctl restart cargoson.service

# Wait briefly for the app to come up on port 3000
for _ in $(seq 1 20); do
  if ss -tln | grep -q ":${APP_PORT} "; then
    break
  fi
  sleep 1
done

if ! ss -tln | grep -q ":${APP_PORT} "; then
  echo "WARN: app didn't listen on :${APP_PORT} within 20s."
  echo "      Check logs:  journalctl -u cargoson -n 100 --no-pager"
fi

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
# Only remove the stock default site; never touch unrelated ones (e.g. paperclip)
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Firewall — only adjust if UFW is already enabled
if command -v ufw >/dev/null 2>&1 && ufw status | head -1 | grep -qi "active"; then
  ufw allow 'Nginx Full' || true
fi

echo
echo "==> 7/7  Obtaining SSL certificate for $DOMAIN"
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
  echo "  Pass:   (unchanged; sudo cat $ADMIN_PASS_FILE)"
fi
echo
echo "  App status:  sudo systemctl status cargoson"
echo "  App logs:    sudo journalctl -u cargoson -f"
echo "  Restart:     sudo systemctl restart cargoson"
echo "  Install log: $LOG_FILE"
echo "=================================================="
