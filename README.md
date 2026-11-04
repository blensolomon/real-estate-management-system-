# Real Estate Sales Management System

Multi-company SaaS for real estate developers and brokerages (built for the Ethiopian market).
It tracks leads, unit inventory, reservations, payment plans, collections, agents and commissions,
so owners know who owes them money, who sold what, and which units are really available.

## Features

| Problem | How it is solved |
| --- | --- |
| Collections | Deals carry an installment schedule. Payments recorded by agents stay **pending** until the Accountant confirms them; confirming issues a numbered, printable receipt (bank / Telebirr reference + receipt upload, duplicate-reference check). Confirmed payments are applied oldest-installment-first; the Collections page shows overdue amounts, days overdue and an aging report (1–30 / 31–60 / 61–90 / 90+). |
| Agent control | Every lead has an owner; agents only see their own leads, reservations and deals. Activities are timestamped and immutable. Follow-ups are tracked with overdue flags; managers can reassign leads (logged). Only the Owner or Admin can move an owned lead. |
| Commission disputes | Commission % is set per project and frozen on the deal. Commission is earned at signing but becomes **payable in proportion to confirmed buyer payments**. Payouts are recorded and per-agent statements are available. |
| Double-selling | Unit status changes via conditional updates inside transactions, plus partial unique indexes (one active reservation and one live deal per unit). Reservations expire automatically after the company's hold period. A reservation whose deposit the accountant confirmed is not released at expiry; it stays held until a manager extends, converts or cancels it. |
| Lead loss | Source tracking (Facebook, Telegram, TikTok, walk-in, referral…), unique phone per company, a follow-up created for every new lead and automatically after each site visit, and a list of open leads with no next step. |
| Scattered documents | Contracts, IDs, receipts and other files are stored per client and deal (PDF/images, 10 MB). |
| No visibility | Live owner dashboard: overdue, outstanding, pending confirmations, monthly collections, inventory, expiring reservations, overdue follow-ups, sales by agent, lead sources and pipeline. Full audit log. |

**Ethiopian calendar:** all dates display in the Ethiopian calendar (switchable to Gregorian in Settings), and date inputs use Ethiopian day / month / year pickers. Conversion is in `src/lib/ethiopian.ts` with tests.

**Roles (checked on the server in every page, action and API route — see `src/lib/permissions.ts`):**

| Role | Can do |
|---|---|
| Owner | Everything. |
| Sales Manager | Leads (can assign unowned leads), follow-ups, reservations, price approvals, monthly sales targets; sees all sales and money reports. |
| Agent / Broker | Only their own leads, clients, reservations, sales and commissions. Can be flagged as an external broker. |
| Accountant | Confirms or rejects payments (issues receipts), approves commissions and marks them paid. No access to leads. |
| Admin | Users, projects/units and company settings (language, reservation length, "quiet lead" days). No access to money reports. |

**Home screen:** six cards (sold this month, collected this month, late payments, units available, waiting for confirmation, needs attention), two charts (money collected per month, sales vs target), and a *Needs attention* list — late buyers, reservations ending within 48 h, leads with no contact for N days — each with Call / WhatsApp / Telegram / Mark done buttons.

**Commissions:** earned at signing, unlocked as buyer payments are confirmed, then **approved** by the Accountant and later **marked paid** (two separate steps, both audited).

**Exports:** every report/list has *Excel* (`/api/export/<report>`, same filters and role scoping as the page) and *PDF* (print-friendly layout, Save as PDF).

**Phones:** bottom menu bar with role-specific shortcuts and a *More* sheet; 44 px tap targets.

**Translations:** UI text goes through `t("English text")` (`src/i18n`). English is the key; add Amharic to `src/i18n/am.ts` and switch the company language in Settings. Untranslated phrases fall back to English.

## Stack

Next.js 15 (App Router, server actions), TypeScript, PostgreSQL, Prisma, Tailwind CSS v4, JWT cookie sessions (jose + bcrypt), pdf-lib (receipts/statements), S3-compatible storage (AWS SDK) with local-disk fallback.

## Getting started

```bash
docker run -d --name resms-db -e POSTGRES_USER=resms -e POSTGRES_PASSWORD=resms -e POSTGRES_DB=resms -p 5432:5432 postgres:16
cp .env.example .env          # then set AUTH_SECRET and CRON_SECRET for production
npm install
npx prisma migrate deploy
npm run db:seed               # optional demo data
npm run dev                   # http://localhost:3000
```

Demo logins (password `password123`): `owner@demo.et`, `manager@demo.et`, `accountant@demo.et`, `admin@demo.et`, `agent@demo.et`, `broker@demo.et` (external broker).
New companies can sign up at `/register`.

Reservations without a confirmed deposit are expired whenever relevant pages load. Prices more than the company's discount limit (default 5%) below list wait in **Price approvals** for the Sales Manager or Owner. For timely expiry in production, schedule:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/expire-reservations`.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `AUTH_SECRET` | Session signing key (`openssl rand -base64 32`) |
| `CRON_SECRET` | Bearer token for `/api/cron/expire-reservations` |
| `UPLOAD_DIR` | Local folder for files when S3 is not configured |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Optional S3-compatible storage (AWS S3, R2, MinIO). Leave `S3_BUCKET` empty to use local disk |
| `TEST_DATABASE_URL` | Separate database for `npm run test:rules` |

## Docker and backups

```bash
cp .env.example .env    # set AUTH_SECRET, CRON_SECRET, POSTGRES_PASSWORD, optional S3_*
docker compose up -d --build
```

This runs the app (migrations apply on start), PostgreSQL, and a `backup` service that writes `./backups/resms-YYYY-MM-DD.sql.gz` once a day and keeps 14 days (`BACKUP_KEEP_DAYS`). The first backup is taken once the app is healthy. The app refuses to start unless `AUTH_SECRET` is at least 32 characters.

- Load demo data (optional): `docker compose exec app npx prisma db seed`
- Different host port: `APP_PORT=8080 docker compose up -d`
- Serving over plain HTTP on a LAN IP (no HTTPS)? Set `COOKIE_SECURE=false`, otherwise login cookies are dropped by the browser. Use HTTPS (reverse proxy) for anything internet-facing. Restore: `gunzip -c backups/resms-<date>.sql.gz | docker compose exec -T db psql -U resms resms`.

## Business rules enforced by the database

- One active reservation and one live sale per unit (unique indexes); reserving flips the unit from Available in the same transaction.
- Confirmed payments cannot be edited (trigger). Corrections are a linked negative **reversal** entry; pending mistakes are **voided** with a reason.
- Payments, sales, installments, reservations, payment plans and commission payouts cannot be deleted; audit log rows cannot be changed or deleted.
- Money is `DECIMAL(14,2)`. Timestamps are stored in UTC and shown in Addis Ababa time, in the Ethiopian or Gregorian calendar.

## Manager guide (one page)

- **Home** answers: how much we sold, how much we collected, who is late, which units are free, which agents/leads need attention. Tap an item in *Needs attention* to call, WhatsApp or Telegram the person, or mark it done.
- **Units**: green = available, amber = reserved, blue = sold, purple = handed over. Tap a unit code to see its full history (sales, reservations, price changes).
- **Reserve**: pick an available unit, enter the buyer's name and phone. The reservation ends automatically after the company's set number of days unless it becomes a sale.
- **Make it a sale**: from a reservation, choose the plan: full cash, down payment + monthly installments, or down payment + bank loan. The schedule is created automatically.
- **Payments**: agents record payments with the bank/Telebirr reference and a proof photo. They stay *pending* until the accountant confirms them; only confirmed money counts. Confirming issues a numbered receipt (PDF).
- **Mistakes**: a pending payment can be voided with a reason. A confirmed payment can't be changed; the accountant records a reversal, and both entries stay in the history.
- **Client statement**: on any sale, *Client statement (PDF)* shows the schedule, confirmed payments and balance.
- **Who owes us money**: everyone with overdue installments, oldest first. Export to Excel or PDF from any report.
- **Roles**: Owner sees everything; Sales Manager runs agents, leads and targets; agents and brokers see only their own leads, clients and commissions; the Accountant confirms payments and approves commissions; Admin manages users, projects and settings.

## Scripts

`npm run lint`, `npm run typecheck`, `npm test` (calendar and finance logic), `npm run test:rules` (business rules against `TEST_DATABASE_URL`; run `npx prisma migrate deploy` on it first), `npm run test:e2e` (Playwright, phone + desktop, needs the seeded app on :3000), `npm run build`.
