# Deploy — Cargoson Monitor on a VPS

Single-command install for Ubuntu 22/24 or Debian 12 VPS. Installs Node.js 20,
PostgreSQL, nginx and Let's Encrypt SSL; builds the Next.js app; creates an
admin user; runs the app under systemd.

## One-liner

After SSHing to the server:

```bash
curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
  | sudo DOMAIN=cargoson.efapp.pl ADMIN_EMAIL=you@example.com bash
```

The script is **idempotent** — re-running it pulls the latest `main`, reinstalls
dependencies, and restarts the app. The admin password is generated once on
first run and stored at `/etc/cargoson-admin.pass` (chmod 600, root only). All
output is also written to `/var/log/cargoson-install.log`.

## Prerequisites

- Public domain pointing to the VPS — check with `dig +short $DOMAIN`
- Ports 80 and 443 open to the internet
- Root or sudo access

## What the script sets up

| Piece          | Where                                                |
|----------------|------------------------------------------------------|
| App user       | `cargoson` (system user, home in `/home/cargoson`)   |
| Code           | `/opt/cargoson_monitor`                              |
| Environment    | `/opt/cargoson_monitor/nextjs_space/.env` (chmod 600)|
| Database       | PostgreSQL local, db=`cargoson`, user=`cargoson`     |
| Secrets        | `/etc/cargoson-db.pass`, `/etc/cargoson-nextauth.secret`, `/etc/cargoson-admin.pass` |
| Service        | systemd unit `cargoson.service` running `npm start`  |
| Reverse proxy  | nginx `/etc/nginx/sites-enabled/cargoson`            |
| TLS            | certbot + Let's Encrypt (auto-renew via systemd timer)|

## Operations

```bash
# Status
sudo systemctl status cargoson

# Logs (follow)
sudo journalctl -u cargoson -f

# Logs (last 200 lines)
sudo journalctl -u cargoson -n 200 --no-pager

# Restart
sudo systemctl restart cargoson

# Update to latest main + rebuild
curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
  | sudo DOMAIN=cargoson.efapp.pl ADMIN_EMAIL=you@example.com bash
```

## Resetting the admin password

```bash
sudo rm /etc/cargoson-admin.pass
sudo DOMAIN=cargoson.efapp.pl ADMIN_EMAIL=you@example.com \
  bash /opt/cargoson_monitor/deploy/install.sh
# A new password is generated and printed.
```

## Cargoson API key

The installer leaves `CARGOSON_API_KEY=''` empty — fill it in after install:

```bash
sudo -u cargoson sed -i "s|^CARGOSON_API_KEY=.*|CARGOSON_API_KEY='your_real_key'|" \
  /opt/cargoson_monitor/nextjs_space/.env
sudo systemctl restart cargoson
```

## Uninstall

```bash
sudo systemctl stop cargoson && sudo systemctl disable cargoson
sudo rm -f /etc/systemd/system/cargoson.service && sudo systemctl daemon-reload
sudo rm -f /etc/nginx/sites-enabled/cargoson /etc/nginx/sites-available/cargoson
sudo systemctl reload nginx
sudo -u postgres dropdb cargoson && sudo -u postgres dropuser cargoson
sudo rm -rf /opt/cargoson_monitor /etc/cargoson-*.{pass,secret}
sudo deluser --remove-home cargoson
```
