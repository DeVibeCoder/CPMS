# CPSM — Cement Plant Stock Management System

A production-ready web app that replaces the manual "update a Word doc → export
PDF → save in a folder" routine for daily cement-plant stock reporting. Fast,
auto-calculating, auditable, and it generates a print-accurate PDF in one click.

Built with **React + TypeScript + Vite + TailwindCSS** and a shadcn-style UI
component layer. Dark-blue industrial theme with full light/dark mode.

---

## Quick start

CPSM requires an Appwrite backend — there is no offline mode and no demo data.
Set one up once by following [`appwrite/README.md`](appwrite/README.md):

```bash
npm install
cp .env.example .env.local          # endpoint, project id, API key
npm run appwrite:setup              # database, tables, permissions
npm run appwrite:bootstrap -- you@example.com "a-good-password" "Your Name"
npm run dev                         # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to /dist
npm run preview    # preview the production build
npm run typecheck  # type-check only
npm run appwrite:seed   # optional 12/07/2026 reference report
```

Without `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` the app shows a
"Backend not configured" screen rather than starting. Vite inlines those at
build time, so changing them needs a rebuild, not just a restart.

### Roles

| Role     | Can do                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Admin    | Everything: create/edit/delete reports, users, settings, backup          |
| Dispatch | View, create/edit reports, generate PDF & print. No users/settings/delete |
| Viewer   | Read-only — view reports, dashboards & analytics                         |

There are no default accounts. The first admin is created by
`npm run appwrite:bootstrap`; everyone else is created through Settings → Users.

Roles are enforced twice — through the capability map in `src/store/auth.ts`,
which decides what the UI shows, and through Appwrite's table permissions, which
decide what is actually allowed. A role is an Appwrite account *label*, so it
cannot be changed from the browser.

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

`src/data/appwriteRepository.ts` implements it against Appwrite Auth + TablesDB
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
  data/          repository interface + Appwrite implementation
  lib/           appwrite client, calculations, analytics, pdf, utils
  pages/         one file per route
  store/         zustand stores (auth, theme, settings)
  types/         domain model
appwrite/        schema setup, bootstrap & seed scripts, admin-users function
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
width factors). `npm run appwrite:seed` inserts the sample report (12/07/2026)
with the exact source figures, so you can open it and compare the output side by
side with the original — the row/column values match.

---

## Production checklist

- Set `VITE_APPWRITE_ENDPOINT` / `VITE_APPWRITE_PROJECT_ID` in your host's
  environment, before the build — Vite inlines them at build time.
- Deploy the `admin-users` function — without it, user management fails.
- Register the deployed origin as a Web platform in the Appwrite console.
- Restrict signup so accounts are only ever created through the app.

All four are covered step by step in [`appwrite/README.md`](appwrite/README.md).

---

## Keeping the Appwrite Free plan project alive

Since 20 February 2026, Appwrite pauses Free plan projects after **7 consecutive
days without development activity in the Appwrite Console**. Appwrite have said
explicitly that runtime traffic does not count:

> Runtime traffic such as API calls, SDK usage, or end-user visits does not
> count toward this.

So the plant signing in every day does **not** keep the backend alive. This
project has already been paused once for exactly this reason, which took the app
down until it was restored by hand in the console.

**The automatic mitigation.** `api/keepalive.mjs` runs daily from a Vercel cron
and performs a real schema write (create a scratch table, delete it again) —
the same control-plane endpoint the Console uses when you add a collection.
It needs two environment variables on Vercel, in addition to the two the build
already uses:

| Variable          | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| `APPWRITE_API_KEY`| The existing server key (Databases scope is enough)           |
| `CRON_SECRET`     | Any long random string — Vercel sends it back as the bearer token |

Without `CRON_SECRET` the route refuses to run, so it can never be triggered by
a stranger. Run it by hand any time with `npm run appwrite:keepalive`.

**Do not trust it blindly.** Appwrite does not document what counts as
development activity, and users report that merely *opening* the console is not
enough. The cron targets the most plausible signal; it is not a guarantee. Two
things exist because of that:

- A failed run answers non-2xx, so Vercel marks the cron invocation as failed
  and it shows in the dashboard rather than failing silently.
- Sign-in now says "the Appwrite project may be paused" instead of "invalid
  email or password" when the backend is unreachable — see
  `backendUnavailableMessage` in [`src/data/appwriteRepository.ts`](src/data/appwriteRepository.ts).

**The manual fallback that definitely works.** Open the console once a week and
make a small real change — rename a table, edit a permission, redeploy the
function. If the app ever shows the "project may be paused" message, restore it
at <https://cloud.appwrite.io/console>; the data is not deleted by a pause.

The only guaranteed fix is a paid plan — Appwrite state that the Free plan is
for development and learning, not production apps needing uptime.
