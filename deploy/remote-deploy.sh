#!/usr/bin/env bash
# Executed on the VPS by the CI/CD workflow (or manually) to deploy the
# latest `main` of cargoson_monitor. Must be run as root (via sudo from
# an account whose sudoers rule allows this exact path with NOPASSWD).

set -Eeuo pipefail

APP_DIR="/opt/cargoson_monitor"
APP_USER="cargoson"
LOG_FILE="/var/log/cargoson-deploy.log"

touch "$LOG_FILE"; chmod 600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

echo
echo "=== $(date -Is) deploy run ==="

# 1. Pull the newest main. Run as the cargoson user to avoid the "dubious
#    ownership" trap (git 2.35+ complains when root operates on a repo owned
#    by another user).
sudo -u "$APP_USER" -H bash -c "
  set -e
  cd '$APP_DIR'
  git fetch --all --quiet
  git reset --hard origin/main
"
HEAD_SHA=$(sudo -u "$APP_USER" -H git -C "$APP_DIR" rev-parse --short HEAD)
echo "checked out: $HEAD_SHA"

# 2. Build / migrate as cargoson user. Idempotent — npm install is a no-op
#    when package-lock hasn't changed.
sudo -u "$APP_USER" -H bash -c "
  set -Eeuo pipefail
  cd '$APP_DIR/nextjs_space'
  echo '  [deploy] npm install'
  npm install --legacy-peer-deps --no-audit --no-fund --loglevel=error
  echo '  [deploy] prisma generate'
  npx prisma generate
  echo '  [deploy] prisma db push'
  npx prisma db push --accept-data-loss --skip-generate
  echo '  [deploy] next build'
  npm run build
"

# 3. Make sure nginx proxies long Cargoson-driven calls (default 60s is too
#    short for /api/check-prices, which runs up to 27 API calls in series).
NGINX_CONF="/etc/nginx/sites-available/cargoson"
if [[ -f "$NGINX_CONF" ]] && ! grep -q 'proxy_read_timeout 300s' "$NGINX_CONF"; then
  echo "patching nginx with 300s proxy timeouts..."
  # Insert directives right after the proxy_pass line.
  sed -i '/proxy_pass http:\/\/127\.0\.0\.1:/a\        proxy_read_timeout 300s;\n        proxy_send_timeout 300s;' \
    "$NGINX_CONF"
  if nginx -t 2>&1 | grep -q "syntax is ok"; then
    systemctl reload nginx
    echo "nginx reloaded"
  else
    echo "nginx -t failed, reverting change"
    sed -i '/proxy_read_timeout 300s;/d; /proxy_send_timeout 300s;/d' "$NGINX_CONF"
  fi
fi

# 4. Make sure CRON_SECRET exists in .env so /api/cron/check-prices works.
ENV_FILE="$APP_DIR/nextjs_space/.env"
SECRET_FILE="/etc/cargoson-cron.secret"
if [[ -f "$ENV_FILE" ]] && ! grep -q '^CRON_SECRET=' "$ENV_FILE"; then
  if [[ ! -f "$SECRET_FILE" ]]; then
    ( umask 077; openssl rand -hex 32 > "$SECRET_FILE" )
    chmod 600 "$SECRET_FILE"
  fi
  CRON_SECRET=$(cat "$SECRET_FILE")
  echo "CRON_SECRET='${CRON_SECRET}'" >> "$ENV_FILE"
  echo "added CRON_SECRET to .env"
fi

# 5. Make sure the systemd timer is installed (idempotent).
if [[ ! -f /etc/systemd/system/cargoson-cron.timer ]]; then
  CRON_SECRET=$(cat "$SECRET_FILE" 2>/dev/null || echo "")
  if [[ -n "$CRON_SECRET" ]]; then
    cat > /etc/systemd/system/cargoson-cron.service <<UNIT
[Unit]
Description=Cargoson Monitor — periodic price check trigger
After=network.target cargoson.service
Requires=cargoson.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS --max-time 290 \\
  -H "Authorization: Bearer ${CRON_SECRET}" \\
  -X POST http://127.0.0.1:3000/api/cron/check-prices
UNIT

    cat > /etc/systemd/system/cargoson-cron.timer <<TIMER
[Unit]
Description=Cargoson Monitor cron — runs every 5 min, app self-gates on Settings

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Persistent=true
Unit=cargoson-cron.service

[Install]
WantedBy=timers.target
TIMER
    systemctl daemon-reload
    systemctl enable --now cargoson-cron.timer
    echo "installed cargoson-cron.timer"
  fi
fi

# 6. Restart the app under systemd.
systemctl restart cargoson.service
sleep 2
if systemctl is-active --quiet cargoson.service; then
  echo "cargoson.service: active"
else
  echo "cargoson.service: NOT active — investigate journalctl -u cargoson -n 50" >&2
  exit 1
fi

echo "=== deploy done ($HEAD_SHA) ==="
