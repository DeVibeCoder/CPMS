# CPSM — Cement Plant Stock Management System

A production-ready web app that replaces the manual "update a Word doc → export
PDF → save in a folder" routine for daily cement-plant stock reporting. Fast,
auto-calculating, auditable, and it generates a print-accurate PDF in one click.

Built with **React + TypeScript + Vite + TailwindCSS** and a shadcn-style UI
component layer. Dark-blue industrial theme with full light/dark mode.

---

## Quick start

CPSM requires a Supabase backend — there is no offline mode and no demo data.

```bash
npm install
cp .env.example .env.local          # project URL + publishable key
npm run db:migrate                  # tables, row-level security, grants
npm run dev                         # http://localhost:5173
```

`db:migrate` applies `supabase/migrations/` through the Supabase Management API
and needs `SUPABASE_ACCESS_TOKEN` in `.env.local`. It records what it has
applied in `supabase_migrations.schema_migrations` — the same table the Supabase
CLI uses — so it never runs a migration twice.

Other scripts:

```bash
npm run build            # type-check + production build to /dist
npm run preview          # preview the production build
npm run typecheck        # type-check only
npm run test:admin       # exercise api/admin-users against the project
npm run test:attendance  # attendance calculations + sample data
```

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the app shows a
"Backend not configured" screen rather than starting. Vite inlines those at
build time, so changing them needs a rebuild, not just a restart.

### Roles

| Role     | Can do                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Admin    | Everything: create/edit/delete reports, users, settings, backup          |
| Dispatch | View, create/edit reports, generate PDF & print. No users/settings/delete |
| Viewer   | Read-only — view reports, dashboards & analytics                         |

There are no default accounts. Users are created through Settings → Users,
which calls `api/admin-users` — the only place the service key is used.

Roles are enforced twice — through the capability map in `src/store/auth.ts`,
which decides what the UI shows, and through row-level security in
`supabase/migrations/`, which decides what is actually allowed. A role is a
claim in the account's `app_metadata`, writable only by the service key, so a
user with rights over their own profile row still cannot promote themselves.

---

## Features

- **Dashboard** — today's report status, 9 live KPI cards, trend charts
  (current stock, production vs sales, cement stock, 50KG bags), recent reports,
  quick actions, and Today / Yesterday / 7-day / month / custom date filters.
- **Create / Edit Report** — all 6 sections of the manual report with **every
  total auto-calculated** (no manual math), comma-formatted numbers, decimal
  support, per-day uniqueness guard, drafts & finals.
- **Report History** — searchable/sortable/paginated table with View, Edit,
  Print, Download PDF, Duplicate and Delete (admin) actions.
- **View Report** — an on-screen, print-accurate replica of the PDF.
- **PDF generation** — vector PDF via jsPDF with dark-blue section headers,
  bordered tables, bold auto-total rows, report date and footer.
- **Analytics** — production/sales/stock/50KG/jumbo trend charts, summary
  stats and a historical comparison table.
- **Users** (admin) — create/edit/deactivate/delete users and assign roles.
- **Settings** (admin) — company name, logo, PDF header/footer, report title,
  bag weight, theme, and JSON **backup / restore / reset**.
- **Profile** — update details and change password.
- **Global search** (Ctrl/Cmd + K) across reports by date, month, year, author.

---

## Architecture

The app talks to data **only** through the `Repository` interface
(`src/data/repository.ts`) — every method is `async`.

`src/data/supabaseRepository.ts` implements it against Supabase Auth + Postgres
and is the only implementation — no page or component imports it directly, so
swapping backends means writing one class and changing one export in
`src/data/index.ts`.

```
src/
  components/
    ui/          shadcn-style primitives (button, card, dialog, table, …)
    layout/      collapsible sidebar, topbar (page title + meta), app shell
    dashboard/   KPI cards, charts, date filter
    report/      report document + numeric field
    common/      logo, page header, theme toggle, confirm dialog
    auth/        route guards
  data/          repository interface + Supabase implementation
  lib/           supabase client, calculations, analytics, pdf, utils
  pages/         one file per route
  store/         zustand stores (auth, theme, settings)
  types/         domain model
supabase/        SQL migrations + migration/verification scripts
api/             serverless routes: admin-users, keepalive
```

### Report domain model

The 6 report sections map to `ReportData` in `src/types/index.ts`. All derived
totals live in `src/lib/calculations.ts` (`computeTotals`) — a report never
stores a manual total, so it can never be internally inconsistent.

---

## Notes on the PDF

The PDF (`src/lib/pdf.ts`) and the on-screen report (`ReportDocument.tsx`)
reproduce the plant's **master report layout 1:1**:

- Title `CEMENT STOCK (dd/MM/yyyy)`, centered.
- `50KG BAGS STOCK` and `JUMBO BAGS STOCK` side by side, `SILO BALANCE` below
  (with the cream-highlighted Sales/Production rows).
- Full-width `50KG EMPTY BAGS STOCK`, `EMPTY JUMBO BAGS STOCK` and
  `NET SLINGS STOCK` tables with the exact column sets (Plant [01–03], G-Store,
  Total; New/Used Net Sling category rows).
- Navy section title bars, slate/blue column headers, bordered cells, bold
  auto-total cells.

All palette and geometry constants are centralised at the top of
`src/lib/pdf.ts` (`NAVY`, `SLATE`, `BLUE`, `CREAM`, `MARGIN`, `GAP`, column
width factors). The sample report (12/07/2026)
with the exact source figures, so you can open it and compare the output side by
side with the original — the row/column values match.

---

## Production checklist

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your host's
  environment. Both are public and ship in the bundle; row-level security is
  what protects the data.
- Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` **without** a `VITE_`
  prefix. Vite inlines every `VITE_` variable into the browser bundle, and
  these two bypass every policy — that prefix is the whole security boundary.
- Turn off "Allow new users to sign up" in the Supabase dashboard. The policies
  grant read to a *role*, never merely to "signed in", but there is no reason to
  let an unprovisioned account exist at all.

---

## Keeping the free-plan project alive

Supabase pauses free projects after 7 days without activity, and counts ordinary
API requests as activity — so daily use by the plant keeps it awake by itself.

The gap is shutdowns. `api/keepalive.mjs` runs daily from a Vercel cron and
reads one row, which covers holidays and quiet weeks. It refuses to run without
`CRON_SECRET`, so it can never be triggered by a stranger, and it answers non-2xx
on failure so a keepalive that has stopped working shows in the Vercel dashboard
rather than surfacing as a locked-out user.

If the project ever does pause, the data is not deleted — restore it from
<https://supabase.com/dashboard>.
