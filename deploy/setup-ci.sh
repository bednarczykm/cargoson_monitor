#!/usr/bin/env bash
# One-time CI/CD bootstrap. Run on the VPS as a user with sudo. Idempotent.
#
# What it does:
#   1. Installs /usr/local/bin/cargoson-deploy as a thin wrapper that invokes
#      the repo's deploy/remote-deploy.sh (kept under root's control).
#   2. Adds a sudoers drop-in allowing the specified DEPLOY_USER to run
#      cargoson-deploy without a password.
#   3. Generates an SSH key pair for CI (if not already present) and prints
#      the public key + instructions for configuring GitHub secrets.
#
# Usage:  sudo DEPLOY_USER=biteam bash deploy/setup-ci.sh

set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-biteam}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2; exit 1
fi

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "ERROR: user '$DEPLOY_USER' doesn't exist on this machine." >&2
  exit 1
fi

echo "==> 1/3  Installing /usr/local/bin/cargoson-deploy"
cat > /usr/local/bin/cargoson-deploy <<'WRAP'
#!/usr/bin/env bash
# Thin wrapper so sudoers can NOPASSWD exactly one command.
exec /opt/cargoson_monitor/deploy/remote-deploy.sh "$@"
WRAP
chmod 755 /usr/local/bin/cargoson-deploy
chown root:root /usr/local/bin/cargoson-deploy

echo "==> 2/3  Writing sudoers drop-in /etc/sudoers.d/cargoson-deploy"
SUDOERS_FILE="/etc/sudoers.d/cargoson-deploy"
cat > "$SUDOERS_FILE" <<SUDO
# Allow $DEPLOY_USER to trigger a Cargoson Monitor redeploy without a password.
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/bin/cargoson-deploy
SUDO
chmod 440 "$SUDOERS_FILE"
chown root:root "$SUDOERS_FILE"
# Validate sudoers syntax; remove file if invalid.
if ! visudo -cq -f "$SUDOERS_FILE"; then
  echo "ERROR: sudoers validation failed" >&2
  rm -f "$SUDOERS_FILE"
  exit 1
fi

echo "==> 3/3  Preparing SSH deploy key for GitHub Actions"
SSH_DIR="/home/$DEPLOY_USER/.ssh"
KEY_FILE="$SSH_DIR/cargoson_ci_ed25519"
AUTH_KEYS="$SSH_DIR/authorized_keys"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"

if [[ ! -f "$KEY_FILE" ]]; then
  sudo -u "$DEPLOY_USER" ssh-keygen -t ed25519 -C "cargoson-ci" -N "" -f "$KEY_FILE"
  # Ensure the public half is also trusted for incoming SSH
  cat "$KEY_FILE.pub" >> "$AUTH_KEYS"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
  chmod 600 "$AUTH_KEYS"
fi

PUBLIC_KEY=$(cat "$KEY_FILE.pub")
PRIVATE_KEY=$(cat "$KEY_FILE")
PUBLIC_IP=$(curl -4 -s --max-time 4 ifconfig.me || hostname -I | awk '{print $1}')

cat <<INFO

=================================================================
 CI/CD bootstrap DONE. Now wire it up in GitHub:
=================================================================
  1. Go to:  https://github.com/bednarczykm/cargoson_monitor/settings/secrets/actions
  2. Create these three repository secrets:

     Name:    DEPLOY_HOST
     Value:   ${PUBLIC_IP}

     Name:    DEPLOY_USER
     Value:   ${DEPLOY_USER}

     Name:    DEPLOY_SSH_KEY
     Value (paste EXACTLY — keep the BEGIN/END lines):
-----------------------------------------------------------------
${PRIVATE_KEY}
-----------------------------------------------------------------

  3. After the next push to main, GitHub Actions will:
       ssh ${DEPLOY_USER}@${PUBLIC_IP} 'sudo /usr/local/bin/cargoson-deploy'
     and redeploy automatically. Watch at:
       https://github.com/bednarczykm/cargoson_monitor/actions

Safety notes:
  - The sudoers rule allows ONLY /usr/local/bin/cargoson-deploy, nothing
    else. The CI account cannot escalate beyond the deploy script.
  - The deploy key above is single-purpose; if you rotate it, re-run this
    script and update DEPLOY_SSH_KEY in GitHub.
=================================================================
INFO
