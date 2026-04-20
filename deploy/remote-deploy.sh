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

# 3. Restart the app under systemd.
systemctl restart cargoson.service
sleep 2
if systemctl is-active --quiet cargoson.service; then
  echo "cargoson.service: active"
else
  echo "cargoson.service: NOT active — investigate journalctl -u cargoson -n 50" >&2
  exit 1
fi

echo "=== deploy done ($HEAD_SHA) ==="
