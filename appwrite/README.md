# Appwrite setup

CPSM requires Appwrite — there is no offline store and no demo data. Without
`VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` the app renders a
"Backend not configured" screen instead of starting.

Targets Appwrite **1.9 / Cloud** (the `TablesDB` API). Work through the steps
below once.

---

## 1. Create the project

1. Go to <https://cloud.appwrite.io> (or your self-hosted console) and create a
   project. Pick a region close to the plant.
2. **Project → Overview** gives you the **Project ID** and the **API Endpoint**
   — the endpoint ends in `/v1`.

## 2. Point the repo at the project

```bash
cp .env.example .env.local
```

```dotenv
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6xxxxxxxxxxxxxxxxxxx
APPWRITE_API_KEY=standard_xxxxxxxx
```

The API key is for the setup scripts only — it is never bundled into the
browser, because Vite only exposes variables prefixed with `VITE_`. Create it
under **Project → Overview → Integrations → API keys** with the **Auth**,
**Databases** and **Functions** scopes.

## 3. Create the schema

```bash
npm run appwrite:setup
```

This is idempotent — re-run it any time. It creates:

| Table      | Holds                                                   |
| ---------- | ------------------------------------------------------- |
| `profiles` | name, username, avatar — one row per account            |
| `reports`  | one row per report date; `data` is the report as JSON   |
| `settings` | the single settings row, under the fixed id `app`       |

…plus the permissions that actually enforce roles:

- **viewer** — may read reports and settings, nothing else.
- **dispatch** — may also create and update reports.
- **admin** — may additionally delete reports, edit settings, and manage users.

A role is an Appwrite **account label**, so the table permissions read
`label:admin` / `label:dispatch`. Only a server API key can change a label,
which is why these rules hold even if someone bypasses the UI and calls the API
directly with the project id.

Disabling a user disables their Appwrite account, so they cannot hold a session
at all — access is cut off immediately, not just at their next login.

## 4. Create your administrator

Nothing in the app can create the first account, so create it here:

```bash
npm run appwrite:bootstrap -- admin@cementplant.com "a-good-password" "Plant Administrator"
```

Re-running it on an existing account promotes and re-enables that account, which
is also how you recover a project with no working admin.

Optionally seed the 12/07/2026 reference report the PDF layout is checked
against:

```bash
npm run appwrite:seed
```

## 5. Deploy the `admin-users` function

Creating and deleting accounts, changing a role, enabling or disabling an
account and resetting somebody else's password all need an API key, which must
never be shipped to a browser. [`functions/admin-users`](functions/admin-users)
is the only place one is used, and it re-verifies on every call that the caller
is a signed-in admin — using a short-lived JWT minted by the client SDK, not a
header the browser controls.

The CLI is the `appwrite-cli` package (`appwrite` on npm is the web SDK):

```bash
npm install --no-save appwrite-cli
npx appwrite client --endpoint <endpoint> --project-id <id> --key <api-key>
cd appwrite
npx appwrite push function --function-id admin-users --force --activate true
```

`--force --activate true` matters: without both, the CLI stops on interactive
prompts. [`appwrite.config.json`](appwrite.config.json) in this directory
describes the function — execute access (`users`), runtime, entrypoint and the
`users.read` / `users.write` / `tables.read` / `rows.read` / `rows.write`
**scopes**. Those scopes make Appwrite inject a dynamic API key at run time, so
no secret is stored on the function. If you would rather use a static key, add
`APPWRITE_API_KEY` as a function variable instead — the function accepts either.

> The final activation step may report `missing scopes (["rules.read"])`. That
> is the CLI trying to create a function *domain*, which this app does not use —
> it calls the function through the SDK. The deployment still activates; confirm
> with **Functions → admin-users**, which should show an active deployment.

> Skipping this step leaves everything else working — only **Settings → Users →
> Add / Delete / role & status changes** will fail, with a message telling you
> the function is missing.

## 6. Turn off public signup

**Auth → Settings → Email/Password** is the only method the app uses. Under
**Auth → Security**, set **Users limit** to your headcount, or disable the
sign-up route entirely if your version offers it.

Accounts should only ever be created by an admin through the app. Even if a
stray account is created another way it gets no role label and no profile row,
so the app refuses to sign it in — but closing the door properly is still worth
a minute.

## 7. Configure Vercel

Add `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` under **Project →
Settings → Environment Variables** for Production, Preview and Development, then
redeploy. Vite inlines env vars at build time, so a redeploy is required —
setting them is not enough.

Also add the deployed origin under **Appwrite → Project → Overview → Platforms →
Add platform → Web**, otherwise the browser SDK is refused. Add
`http://localhost:5173` too for local development.

---

## Notes

**Where each field lives.** The profile row holds only what a user may edit
about themselves: name, display name, username and avatar. Their **role** is an
account label and **active** is the account's enabled flag, both server-side
only. That split is deliberate — it means a user with write access to their own
row still cannot promote themselves, so no trigger or column-level rule is
needed to stop them.

**Backups.** Settings → Backup exports reports, settings and the user list as
JSON. Restoring brings back reports (matched on date) and settings. It does
**not** recreate users: accounts live in Appwrite Auth and the backup contains
no credentials, so restoring them would produce profiles nobody could sign in
to. Recreate users through Settings → Users.

**"Reset database"** deletes every report and restores default settings. It does
not touch accounts.

**"Remember me"** is emulated. Appwrite sessions are long-lived and there is no
per-session "expire when the browser closes" option, so when the box is unticked
the app marks the session in `sessionStorage` — which the browser discards with
the tab — and signs out on the next startup if the marker has gone.

**Changing a sign-in email** is not possible from the app. Change it under
**Auth → Users** in the console.

**Roles are enforced twice** — once in the UI through `can()` in
[`src/store/auth.ts`](../src/store/auth.ts) to decide what to show, and once in
Appwrite through table permissions to decide what is allowed. Changing one
without the other will produce buttons that fail, or rules that are never
reached.
