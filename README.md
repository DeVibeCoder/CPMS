# CPSM — Cement Plant Stock Management System

A production-ready web app that replaces the manual "update a Word doc → export
PDF → save in a folder" routine for daily cement-plant stock reporting. Fast,
auto-calculating, auditable, and it generates a print-accurate PDF in one click.

Built with **React + TypeScript + Vite + TailwindCSS** and a shadcn-style UI
component layer. Dark-blue industrial theme with full light/dark mode.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to /dist
npm run preview    # preview the production build
npm run typecheck  # type-check only
```

### Roles & seeded accounts

| Role     | Email                      | Password       | Can do                                                        |
| -------- | -------------------------- | -------------- | ------------------------------------------------------------ |
| Admin    | `admin@cementplant.com`    | `admin123`     | Everything: create/edit/delete reports, users, settings, backup |
| Dispatch | `dispatch@cementplant.com` | `dispatch123`  | View, create/edit reports, generate PDF & print. No users/settings/delete |
| Viewer   | `viewer@cementplant.com`   | `viewer123`    | Read-only — view reports, dashboards & analytics             |

Roles are enforced through the capability map in `src/store/auth.ts`; the UI
hides actions a role can't perform and the routes are guarded as well. These
seeded accounts exist for local/dev use only — create real users on the Users
page and remove the seeds before going live.

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

## Architecture & migration path

The app talks to data **only** through the `Repository` interface
(`src/data/repository.ts`). The current implementation is a JSON database
persisted to `localStorage` (`src/data/localRepository.ts`) — every method is
already `async`.

**To migrate to Supabase / SQL / a REST API:** implement `Repository` in a new
file and change the single export in `src/data/index.ts`. No page or component
imports a concrete repository, so nothing else changes.

```
src/
  components/
    ui/          shadcn-style primitives (button, card, dialog, table, …)
    layout/      collapsible sidebar, topbar (page title + meta), app shell
    dashboard/   KPI cards, charts, date filter
    report/      report document + numeric field
    common/      logo, page header, theme toggle, confirm dialog
    auth/        route guards
  data/          repository interface + localStorage impl + seed
  lib/           calculations, analytics, pdf, utils
  pages/         one file per route
  store/         zustand stores (auth, theme, settings)
  types/         domain model
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
width factors). The exact figures from the sample report (12/07/2026) are seeded
as a real report so you can open it and compare the output side by side with the
source — the row/column values match.

---

## Production hardening checklist (when moving off the demo)

- Replace the localStorage repository with a real backend (see migration path).
- Replace mock auth with real auth (Supabase Auth / JWT); hash passwords.
- Move role checks server-side (the client guards are UX, not security).
