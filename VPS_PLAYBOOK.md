# VPS Playbook — marcin.skalci.pl / efapp.pl

Brief dla LLM przy stawianiu kolejnych aplikacji na tym serwerze. Wkleić na początku nowej konwersacji.

---

## TL;DR

Marcin ma **jeden VPS w Hetznerze** (Ubuntu 24.04, IP **89.167.14.46**, SSH jako `biteam` z sudo). Chodzą na nim dwie appki (Paperclip + Cargoson Monitor) i planuje kolejne. Każda nowa appka powinna iść **dokładnie wzorcem Cargosona** — to sprawdzona konwencja:

- `/opt/<app_name>` — kod
- system user `<app_name>` — właściciel kodu i procesu
- Postgres lokalnie (na tym samym serwerze, port 5432) — **nie Supabase**
- Node.js 20 + Next.js uruchamiany przez **systemd unit** (nie pm2)
- nginx jako reverse proxy + Let's Encrypt cert
- GitHub Actions push-to-deploy przez SSH → `/usr/local/bin/<app>-deploy` (sudoers NOPASSWD)
- scheduler jako `systemd timer` bijący po lokalny HTTPS endpoint z bearer tokenem

Marcin **nie jest programistą** — komendy wykonuje paste-and-run, więc każdy skrypt musi być idempotentny i mieć jasne błędy.

---

## Inwentarz serwera (stan na 2026-04-20)

### Hardware / OS
- **Host:** Hetzner, IPv4 `89.167.14.46`, IPv6 też działa
- **OS:** Ubuntu 24.04.4 LTS (Noble Numbat)
- **Użytkownik SSH:** `biteam` (uid 1000, sudo OK)
- **Hostname:** `paperclip-marcin`

### Zainstalowane (apt + node)
- **nginx 1.24** — reverse proxy dla wszystkich appek, `/etc/nginx/sites-enabled/*`
- **PostgreSQL 16** — lokalny, nasłuchuje na 127.0.0.1:5432, auth peer dla lokalnych, scram-sha-256 dla hostowych
- **Node.js 20** (z NodeSource), `npm` globalny
- **certbot 2.9** + `python3-certbot-nginx` — Let's Encrypt
- **ufw** — firewall, zwykle aktywny (otwarte: OpenSSH + Nginx Full)
- **build-essential** — gcc, make (potrzebne dla niektórych npm packages z natywnym kodem)
- `git`, `curl`, `openssl`, `gnupg`, `ca-certificates` — bazowo

### Domeny i DNS
- `marcin.skalci.pl` — zarządzany przez **Aftermarket.pl** (NS: `ns1/ns2.aftermarket.pl`). Wskazuje na 89.167.14.46.
- `efapp.pl` — również **Aftermarket.pl**. Używana jako parasol dla kolejnych appek (subdomeny `cargoson.efapp.pl`, planowane dalsze).
- **Dodanie rekordu A dla nowej subdomeny** = zaloguj się na aftermarket.pl → Moje konto → Domeny → edytuj DNS przy `efapp.pl` → dodaj rekord A: nazwa `<sub>`, wartość `89.167.14.46`, TTL 3600. Propagacja 2–10 min.

### Aktualnie hostowane appki

| App | Port | Adres | Service systemd | Nginx site | Uwagi |
|---|---|---|---|---|---|
| **Paperclip** | 3100 | https://marcin.skalci.pl | `paperclip.service` | `/etc/nginx/sites-enabled/paperclip` | IP allowlist (3 adresy), SSL Let's Encrypt |
| **Cargoson Monitor** | 3000 | https://cargoson.efapp.pl | `cargoson.service` + `cargoson-cron.timer` | `/etc/nginx/sites-enabled/cargoson` | Next.js 14 + Prisma + Postgres, publiczny, auto-deploy |

### Zajęte porty (apps)
- 3000 — cargoson
- 3100 — paperclip
- **Kolejne appki zacznij od 3200, 3300, 3400…**

---

## Konwencje (wzorzec Cargosona)

Tak stawiam nową appkę **zawsze w ten sam sposób** — nie odchodź od tego bez dobrego powodu.

### Layout na dysku
```
/opt/<app>/                         # cały kod aplikacji
  .git/
  nextjs_space/                     # (dla Next.js) albo inny subfolder z kodem
    .env                            # chmod 600, owner <app>:<app>
    node_modules/
    .next/                          # build Next.js
  deploy/
    install.sh                      # one-shot bootstrap dla nowego VPS-a
    remote-deploy.sh                # idempotentny, wywoływany z CI
    setup-ci.sh                     # generuje SSH key + sudoers rule
/etc/<app>-db.pass                  # chmod 600, hasło do Postgresa
/etc/<app>-nextauth.secret          # jeśli używasz NextAuth
/etc/<app>-cron.secret              # jeśli masz scheduler (cron endpoint)
/etc/systemd/system/<app>.service          # main web process
/etc/systemd/system/<app>-cron.{service,timer}  # optional scheduler
/etc/nginx/sites-available/<app>
/etc/nginx/sites-enabled/<app>       # symlink
/usr/local/bin/<app>-deploy          # wrapper na deploy/remote-deploy.sh, NOPASSWD sudo
/etc/sudoers.d/<app>-deploy          # rule: biteam ALL=(root) NOPASSWD: /usr/local/bin/<app>-deploy
/home/<app>/                         # home system-usera, tu leży ~/.npm, ~/.ssh
/var/log/<app>-install.log           # log z install.sh/remote-deploy.sh
```

### System user
```bash
useradd --system --create-home --shell /bin/bash <app>
chown -R <app>:<app> /opt/<app>
```
Aplikacja chodzi jako ten user pod systemd (nigdy jako root).

### Postgres
- Lokalny, użytkownik i baza o tej samej nazwie co app:
```sql
CREATE ROLE <app> LOGIN PASSWORD '<hex32>';
CREATE DATABASE <app> OWNER <app>;
```
- `DATABASE_URL='postgresql://<app>:<pass>@127.0.0.1:5432/<app>?connect_timeout=15'` w `.env`
- **Hasło generuj**: `openssl rand -hex 24`, zapisz do `/etc/<app>-db.pass` (chmod 600)
- **Supabase nie używamy** — Supabase to hosted Postgres + realtime + auth; dla naszych appek wystarczy lokalny Postgres. Migracja z Supabase → opisana niżej.

### systemd unit (kopia z cargoson.service)
```ini
[Unit]
Description=<App> web app
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=<app>
Group=<app>
WorkingDirectory=/opt/<app>/nextjs_space
Environment="NODE_ENV=production"
Environment="PORT=<port>"
Environment="HOSTNAME=127.0.0.1"
EnvironmentFile=/opt/<app>/nextjs_space/.env
ExecStart=/usr/bin/npm start --silent
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
```

### nginx site (kopia z cargoson)
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <subdomain>;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        # Long-running API routes (np. check-prices) potrzebują >60s
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```
Certbot `--nginx` doda drugi `server` block dla 443 z Let's Encrypt i wymusi redirect z 80→443.

### CI/CD (GitHub Actions push-to-deploy)

Wzorzec sprawdzony: zobacz `cargoson_monitor/deploy/`:
- `setup-ci.sh` — jednorazowo tworzy `/usr/local/bin/<app>-deploy` (wrapper na `remote-deploy.sh`), sudoers rule `biteam NOPASSWD: /usr/local/bin/<app>-deploy`, generuje SSH key ed25519 na VPS, wypisuje public i private keys z instrukcjami do wklejenia w GitHub secrets.
- `remote-deploy.sh` — odpalany przez CI, robi `git reset --hard origin/main` jako app user, npm install, prisma generate, db push, next build, restart systemd, ewentualnie patchuje nginx (np. proxy_read_timeout).
- `.github/workflows/deploy.yml` — SSH-uje do VPS i odpala `sudo /usr/local/bin/<app>-deploy`. Wymaga 3 secrets: `DEPLOY_HOST`, `DEPLOY_USER` (= `biteam`), `DEPLOY_SSH_KEY` (prywatny klucz z setup-ci.sh).

### Scheduler (jeśli potrzebny)
- Endpoint `/api/cron/<foo>` chroniony bearer tokenem (`process.env.CRON_SECRET`)
- Endpoint SAM decyduje czy jest czas pracować (czyta Settings z bazy: włączone/wyłączone, pause window, interval). Zwraca 200 nawet gdy nic nie robi — żeby timer nie flapował.
- systemd timer `<app>-cron.timer` bije co 5 min i curl-uje endpoint z bearerem.
- Sekret: `/etc/<app>-cron.secret` (chmod 600, `openssl rand -hex 32`). Dodany też do `.env` jako `CRON_SECRET=...`.

---

## Checklist: nowa appka

1. **Nazwa + port + subdomena**
   - Kodowa nazwa (alfanumeryczna, bez myślnika jeżeli to nazwa bazy: `myapp`)
   - Wybierz port **>= 3200** (obecne: 3000 cargoson, 3100 paperclip)
   - Subdomena np. `myapp.efapp.pl`

2. **DNS**
   - Aftermarket.pl → Moje Domeny → efapp.pl → Edytuj DNS → A: `myapp` → `89.167.14.46`
   - Czekaj: `dig +short myapp.efapp.pl` → `89.167.14.46`

3. **Repo GitHub**
   - Utwórz `bednarczykm/<myapp>` (prywatny lub publiczny)
   - Wrzuć kod + `deploy/` (skopiuj szablon z cargoson_monitor i podmień nazwy)

4. **Bootstrap VPS** (jednorazowo)
   - `curl -fsSL https://raw.githubusercontent.com/bednarczykm/<myapp>/main/deploy/install.sh | sudo DOMAIN=myapp.efapp.pl ADMIN_EMAIL=marcinbednarczyk9@gmail.com bash`
   - Zapisz hasło admina z `/etc/myapp-admin.pass`

5. **CI/CD**
   - `sudo DEPLOY_USER=biteam bash /opt/<myapp>/deploy/setup-ci.sh`
   - Output zawiera: DEPLOY_HOST=89.167.14.46, DEPLOY_USER=biteam, DEPLOY_SSH_KEY=<ed25519>
   - Wklej 3 secrets do GitHub: `https://github.com/bednarczykm/<myapp>/settings/secrets/actions`
   - Dodaj `.github/workflows/deploy.yml` (skopiuj z cargoson_monitor)

6. **Test**
   - Zrób pusty commit: `git commit --allow-empty -m "test deploy" && git push`
   - GitHub Actions → zobacz run
   - Wejdź na https://myapp.efapp.pl

---

## Migracja z Vercel → VPS

Wzorzec dla Next.js app (Vercel jest najczęstszy hosting Next.js):

### Co dostaniesz z Vercela
- Kod → już jest w GitHubie
- Env vars → Vercel Project Settings → Environment Variables → „Download .env"
- Domena → przełącz DNS A record na 89.167.14.46 (zamiast Vercel CNAME)

### Adaptacja kodu
- Next.js działa tak samo; jedyne różnice:
  - `maxDuration` — Vercel ma hard limit 10s (free) / 60s (pro); na VPS nie ma limitu, ale systemd może mieć. Długie endpointy mają `maxDuration = 300` + `proxy_read_timeout 300s` w nginxie.
  - Vercel Image Optimization (next/image) — działa lokalnie ale wymaga `sharp` npm install (nie jest problemem)
  - Vercel Cron Jobs — nie są — używaj systemd timer z `/api/cron/*` (jak w Cargoson)
  - Vercel Blob / KV / Postgres — ZASTĄP: użyj lokalnego Postgres; pliki w `/opt/<app>/public` albo osobny bucket S3 jeśli trzeba

### .env
Skopiuj zmienne z Vercela i wklej do `/opt/<myapp>/nextjs_space/.env`. Popraw:
- `NEXTAUTH_URL=https://myapp.efapp.pl` (nie vercel.app)
- `DATABASE_URL` — nowy, do lokalnego Postgresa
- Inne (API keys, webhook URLs) — przenoszone as-is

### Deploy
Postępuj według Checklisty powyżej.

---

## Migracja z Supabase → lokalny Postgres

Supabase = hosted Postgres + realtime + auth + storage. Dla większości aplikacji wystarczy sam Postgres.

### Export z Supabase
1. Supabase Dashboard → Project → Settings → Database → „Connection string" (skopiuj connection pooler URI)
2. Export schemat + dane:
```bash
pg_dump --no-owner --no-acl -Fc -f backup.dump \
  "postgresql://postgres.<project-ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```
   Flagi: `--no-owner --no-acl` — ignoruje Supabase-specyficzne role.

### Import do lokalnego Postgresa
```bash
# Utwórz bazę i usera (jako root/biteam)
sudo -u postgres psql -c "CREATE ROLE <app> LOGIN PASSWORD '<hex32>';"
sudo -u postgres createdb -O <app> <app>

# Restore
pg_restore --no-owner --no-acl -d "postgresql://<app>:<pass>@127.0.0.1:5432/<app>" backup.dump
```

### Zamienniki dla Supabase-specific features
- **supabase-js client** → Prisma albo pg (raw)
- **Supabase Auth** → NextAuth (credentials provider + Prisma adapter, jak w Cargoson) albo Clerk
- **Supabase Realtime** → albo Pusher, albo WebSockets, albo polling + server-sent events. **Uwaga: to osobny temat, jeśli appka tego używa — powiedz LLM co dokładnie.**
- **Supabase Storage** → S3 (AWS / Cloudflare R2 / MinIO na VPS), albo lokalnie na dysku (+ nginx `/files/` serving).
- **Row Level Security (RLS)** → Prisma nie ma bezpośredniego odpowiednika — rób autoryzację w API route'ach.

### .env
- `DATABASE_URL=postgresql://<app>:<pass>@127.0.0.1:5432/<app>?connect_timeout=15`
- Usuń `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- Dodaj `NEXTAUTH_SECRET`, `NEXTAUTH_URL` jeśli używasz NextAuth

---

## Tooling preferowany (nie zmieniaj bez powodu)

- **Framework**: Next.js 14+ (App Router)
- **ORM**: Prisma (generuje typy, migracje, `db push` do prototype, `migrate deploy` do produkcji)
- **Auth**: NextAuth z CredentialsProvider + Prisma adapter
- **Styl**: Tailwind CSS + shadcn/ui
- **Node**: 20 LTS
- **Postgres**: 16
- **Process manager**: systemd (nie pm2 — pm2 miał problemy z permissions)
- **Reverse proxy**: nginx
- **TLS**: Let's Encrypt przez certbot
- **Scheduler**: systemd timer + cron endpoint z bearer token
- **CI/CD**: GitHub Actions → SSH → `sudo /usr/local/bin/<app>-deploy`
- **Secrets w `.env`**: proste, bez vaultów

---

## Znane pułapki (gotchas)

1. **Git `dubious ownership`** — gdy root operuje na repo owned by `<app>`:
   ```bash
   git -c safe.directory=/opt/<app> -C /opt/<app> <command>
   ```

2. **`sudo -u <user>` i HOME** — sudo domyślnie NIE ustawia HOME. Użyj `sudo -u <user> -H ...` albo `env HOME=/home/<user>`.

3. **npm install w systemd deployu** — `cargoson` user potrzebuje HOME do `.npm` cache. `remote-deploy.sh` robi `sudo -u cargoson -H bash -c ...`.

4. **Prisma binary** — schemat Prismy może mieć hardcoded `output = "/home/ubuntu/..."` (Abacus.AI legacy). Sprawdź i zmień na default `binaryTargets = ["native"]`.

5. **nginx timeout** — domyślne `proxy_read_timeout` to 60s. Dla długich API routów (Cargoson check-prices idzie 30-60s) trzeba 300s. Patrz szablon wyżej.

6. **Next.js maxDuration** — domyślny 10s jest za krótki. W długich route handlers ustaw:
   ```ts
   export const maxDuration = 300;
   ```

7. **CDN cache na raw.githubusercontent.com** — po pushu na GitHuba, `main` raw-URL ma ~5 min cache. Przy pilnej poprawce podaj SHA commit-a zamiast `main`.

8. **GitHub fine-grained PAT** — rotacja uprawnień wymaga klikania „Update" na dole strony. Edit bez save nic nie zmienia.

9. **Hetzner tmpfs `/tmp`** — czasem ma dziwne flagi (noexec?). Nie pisz skryptów do `/tmp` które musisz potem `bash uruchamiać`. Lepiej `bash -s <<HEREDOC`.

10. **Let's Encrypt rate limit** — 5 cert requests per hostname per week. Przy debugowaniu certbota używaj `--dry-run` aż zadziała.

---

## Szybkie komendy operacyjne

```bash
# Status wszystkich appek
systemctl status paperclip cargoson

# Logi appki (live)
sudo journalctl -u cargoson -f

# Restart appki
sudo systemctl restart cargoson

# Listę systemd timer'ów
sudo systemctl list-timers

# Co nasłuchuje na jakim porcie
sudo ss -tlnp | grep LISTEN

# nginx sites
ls /etc/nginx/sites-enabled/

# Certbot — status wszystkich certs + renew
sudo certbot certificates
sudo certbot renew --dry-run

# Miejsce na dysku
df -h

# Top procesów
htop

# Jakie appki są na /opt
ls /opt/
```

---

## Minimalna instrukcja dla nowego LLM

Wklej do nowej konwersacji (skopiuj od `>>> START <<<` do `>>> END <<<`):

```
>>> START <<<
Jestem Marcin. Nie jestem programistą, komendy wykonuję paste-and-run. Mam
VPS w Hetznerze (Ubuntu 24.04, IP 89.167.14.46, SSH jako biteam z sudo).
Planuję postawić nową aplikację <opisz jaką> — obecnie jest ona na
Vercel (frontend Next.js) i Supabase (baza+auth). Chcę przenieść ją
na swój VPS wzorcem użytym dla Cargoson Monitor (już tam chodzi).

Mam w repo cargoson_monitor (https://github.com/bednarczykm/cargoson_monitor)
pełny playbook pod plikiem VPS_PLAYBOOK.md — opisuje konwencje (systemd,
nginx, Postgres lokalny, GitHub Actions push-to-deploy, systemd timer
dla scheduler). Trzymaj się dokładnie tego wzorca przy tej nowej appce.

Używaj portu >= 3200 (3000 i 3100 zajęte). Stwórz plik install.sh
i remote-deploy.sh według wzorca z cargoson_monitor/deploy/. Pokaż mi
komendy paste-and-run.

[TU wklej VPS_PLAYBOOK.md albo link do niego]
>>> END <<<
```

---

## Kontakt z tym dokumentem

Ten plik jest też w repo `bednarczykm/cargoson_monitor` pod `/VPS_PLAYBOOK.md` (commituję go razem z tym opisem). Aktualizuj gdy:
- Dodasz kolejną appkę (dopisz do tabeli w inwentarzu + zajęty port)
- Zmienisz konwencję (np. przejdziesz na docker-compose)
- Trafisz na nową pułapkę (dodaj do „Znane pułapki")
