# Real Estate Sales Management System

Multi-company SaaS for real estate developers and brokerages (built for the Ethiopian market).
It tracks leads, unit inventory, reservations, payment plans, collections, agents and commissions,
so owners know who owes them money, who sold what, and which units are really available.

## Features

| Problem | How it is solved |
| --- | --- |
| Collections | Deals carry an installment schedule. Payments recorded by agents stay **pending** until the Accountant confirms them; confirming issues a numbered, printable receipt (bank / Telebirr reference + receipt upload, duplicate-reference check). Confirmed payments are applied oldest-installment-first; the Collections page shows overdue amounts, days overdue and an aging report (1–30 / 31–60 / 61–90 / 90+). |
| Agent control | Every lead has an owner; agents only see their own leads, reservations and deals. Activities are timestamped and immutable. Follow-ups are tracked with overdue flags; managers can reassign leads (logged). |
| Commission disputes | Commission % is set per project and frozen on the deal. Commission is earned at signing but becomes **payable in proportion to confirmed buyer payments**. Payouts are recorded and per-agent statements are available. |
| Double-selling | Unit status changes via conditional updates inside transactions, plus partial unique indexes (one active reservation and one live deal per unit). Reservations expire automatically after the company's hold period. |
| Lead loss | Source tracking (Facebook, Telegram, TikTok, walk-in, referral…), unique phone per company, a follow-up created for every new lead and automatically after each site visit, and a list of open leads with no next step. |
| Scattered documents | Contracts, IDs, receipts and other files are stored per client and deal (PDF/images, 10 MB). |
| No visibility | Live owner dashboard: overdue, outstanding, pending confirmations, monthly collections, inventory, expiring reservations, overdue follow-ups, sales by agent, lead sources and pipeline. Full audit log. |

**Ethiopian calendar:** all dates display in the Ethiopian calendar (switchable to Gregorian in Settings), and date inputs use Ethiopian day / month / year pickers. Conversion is in `src/lib/ethiopian.ts` with tests.

**Roles (checked on the server in every page, action and API route — see `src/lib/permissions.ts`):**

| Role | Can do |
|---|---|
| Owner | Everything. |
| Sales Manager | Leads, follow-ups, reassignment, reservations, monthly sales targets; sees all sales and money reports. |
| Agent / Broker | Only their own leads, clients, reservations, sales and commissions. Can be flagged as an external broker. |
| Accountant | Confirms or rejects payments (issues receipts), approves commissions and marks them paid. No access to leads. |
| Admin | Users, projects/units and company settings (language, reservation length, "quiet lead" days). No access to money reports. |

**Home screen:** six cards (sold this month, collected this month, late payments, units available, waiting for confirmation, needs attention), two charts (money collected per month, sales vs target), and a *Needs attention* list — late buyers, reservations ending within 48 h, leads with no contact for N days — each with Call / WhatsApp / Telegram / Mark done buttons.

**Commissions:** earned at signing, unlocked as buyer payments are confirmed, then **approved** by the Accountant and later **marked paid** (two separate steps, both audited).

**Exports:** every report/list has *Excel* (`/api/export/<report>`, same filters and role scoping as the page) and *PDF* (print-friendly layout, Save as PDF).

**Phones:** bottom menu bar with role-specific shortcuts and a *More* sheet; 44 px tap targets.

**Translations:** UI text goes through `t("English text")` (`src/i18n`). English is the key; add Amharic to `src/i18n/am.ts` and switch the company language in Settings. Untranslated phrases fall back to English.

## Stack

Next.js 15 (App Router, server actions), TypeScript, PostgreSQL, Prisma, Tailwind CSS v4, JWT cookie sessions (jose + bcrypt).

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

Reservations are expired whenever relevant pages load. For timely expiry in production, schedule:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/expire-reservations`.

## Scripts

`npm run lint`, `npm run typecheck`, `npm test` (calendar and finance logic), `npm run build`.
