# Cargoson Monitor

Aplikacja do monitorowania cen przewoźników (Cargoson) z panelem webowym, automatycznym sprawdzaniem cenników i powiadomieniami.

## Struktura repo

```
cargoson_monitor/
├── nextjs_space/        # Next.js 14 + Prisma + NextAuth – panel webowy i API
│   ├── app/             # App Router (dashboard, login, signup, /api/*)
│   ├── components/      # UI (shadcn/ui) + sidebar
│   ├── lib/             # cargoson.ts, carriers.ts, db.ts, auth-options.ts, slack.ts
│   ├── prisma/          # schema.prisma
│   └── scripts/         # TS helpers (seed, pricelists, testy API)
├── python_scripts/      # Skrypty monitorujące uruchamiane zewnętrznie (cron / ręcznie)
│   ├── check_prices.py
│   ├── monitor_prices.py
│   ├── send_notifications.py
│   ├── run_check.py
│   └── get_api_key.py
├── db/
│   └── schema.sql       # SQL schema (kopia / backup Prismy)
└── docs/
    ├── cargoson_api_info.md
    └── cargoson_api_info.pdf
```

## Szybki start (panel webowy)

```bash
cd nextjs_space
cp ../.env.example .env        # uzupełnij prawdziwe wartości
yarn install                   # lub npm install
yarn prisma generate
yarn prisma migrate deploy     # lub db push przy czystej bazie
yarn dev                       # http://localhost:3000
```

## Zmienne środowiskowe

Wszystkie sekrety trzymaj w `.env` (nie commituj). Szablon w `.env.example`:

- `DATABASE_URL` – Postgres do Prismy
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` – NextAuth
- `CARGOSON_API_KEY` – klucz do API Cargoson
- `ABACUSAI_API_KEY`, `WEB_APP_ID`, `NOTIF_ID_*` – opcjonalne integracje

## Python scripts

Osobne skrypty monitorujące (cron / ręczne uruchomienie). Wymagają tego samego `DATABASE_URL` i `CARGOSON_API_KEY`.

```bash
cd python_scripts
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # TODO: dodać plik
python check_prices.py
```

## Dokumentacja API

Zobacz `docs/cargoson_api_info.md` – endpointy, autoryzacja, przykłady zapytań.
