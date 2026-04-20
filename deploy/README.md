# Deploy — Cargoson Monitor on a VPS

Single-command install for Ubuntu 22/24 or Debian 12 VPS. Installs Node.js 20,
PostgreSQL, nginx, pm2 and Let's Encrypt SSL; builds the Next.js app; creates
an admin user.

## One-liner

After SSHing to the server as root (or a sudo-capable user):

```bash
curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
  | sudo DOMAIN=marcin.skalci.pl ADMIN_EMAIL=marcinbednarczyk9@gmail.com bash
```

The script is **idempotent** — re-running it pulls the latest `main`, reinstalls
dependencies, and restarts the app via pm2. The admin password is generated once
on first run and stored at `/etc/cargoson-admin.pass` (chmod 600, root only).

## Prerequisites

- Public domain pointing to the VPS (we use `marcin.skalci.pl`) — check with `dig +short marcin.skalci.pl`
- Ports 80 and 443 open to the internet (`ufw` will be configured to allow them)
- Root or sudo access

## What the script sets up

| Piece          | Where                                                |
|----------------|------------------------------------------------------|
| App user       | `cargoson` (system user, home in `/home/cargoson`)   |
| Code           | `/opt/cargoson_monitor`                              |
| Environment    | `/opt/cargoson_monitor/nextjs_space/.env` (chmod 600)|
| Database       | PostgreSQL local, db=`cargoson`, user=`cargoson`     |
| Secrets        | `/etc/cargoson-db.pass`, `/etc/cargoson-nextauth.secret`, `/etc/cargoson-admin.pass` |
| Process        | `pm2` running `npm start` on port 3000               |
| Reverse proxy  | nginx `/etc/nginx/sites-enabled/cargoson`            |
| TLS            | certbot + Let's Encrypt (auto-renew via systemd timer)|

## After installation

Log in at `https://marcin.skalci.pl` with the admin email and the password
printed at the end of the installer. The password can be read anytime with:

```bash
sudo cat /etc/cargoson-admin.pass
```

## Operations

```bash
# Status
sudo -u cargoson pm2 status

# Logs
sudo -u cargoson pm2 logs cargoson --lines 200

# Restart
sudo -u cargoson pm2 restart cargoson

# Update to latest main + rebuild
curl -fsSL https://raw.githubusercontent.com/bednarczykm/cargoson_monitor/main/deploy/install.sh \
  | sudo DOMAIN=marcin.skalci.pl ADMIN_EMAIL=marcinbednarczyk9@gmail.com bash
```

## Resetting the admin password

```bash
sudo rm /etc/cargoson-admin.pass
sudo DOMAIN=marcin.skalci.pl ADMIN_EMAIL=marcinbednarczyk9@gmail.com \
  bash /opt/cargoson_monitor/deploy/install.sh
# A new password is generated and printed.
```

## Cargoson API key

The installer leaves `CARGOSON_API_KEY=''` empty — fill it in after install:

```bash
sudo -u cargoson sed -i "s|^CARGOSON_API_KEY=.*|CARGOSON_API_KEY='your_real_key'|" \
  /opt/cargoson_monitor/nextjs_space/.env
sudo -u cargoson pm2 restart cargoson
```
