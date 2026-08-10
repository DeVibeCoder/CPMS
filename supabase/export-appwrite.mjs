// =============================================================================
// Phase 0 — full export of the live Appwrite project.
//
// Writes one timestamped JSON file in the same backend-neutral `Database` shape
// that Settings → Backup produces, so the result can be restored through the
// running app as well as read by the migration scripts.
//
//   npm run backup:appwrite
//
// The file is then read back off disk and checked against what was fetched.
// A backup nobody has verified is a hope, not a backup, so a mismatch exits
// non-zero rather than printing a warning nobody reads.
//
// Contains no credentials: Appwrite holds password hashes on the account, and
// the `Database` shape has no field for them. What it does contain is every
// report the plant has filed and the users' profile pictures, so the output
// directory is gitignored.
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Query, TablesDB, Users } from "node-appwrite";
import { loadEnv, requireEnv } from "../appwrite/env.mjs";

loadEnv();

const { endpoint, projectId, apiKey } = requireEnv();
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "cpsm";
const OUT_DIR = resolve(process.cwd(), "backups");

/** Appwrite caps a page at 100 rows; anything longer is walked with a cursor. */
const PAGE_SIZE = 100;

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const tables = new TablesDB(client);
const users = new Users(client);

const ROLES = ["admin", "dispatch", "viewer"];

async function listAllRows(tableId) {
  const out = [];
  let cursor;
  for (;;) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await tables.listRows({ databaseId: DATABASE_ID, tableId, queries });
    out.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return out;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

async function listAllAccounts() {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = await users.list({
      queries: [Query.limit(PAGE_SIZE), Query.offset(offset)],
    });
    out.push(...page.users);
    if (page.users.length < PAGE_SIZE) return out;
    offset += PAGE_SIZE;
  }
}

// ---- Mappers. Deliberately identical to src/data/appwriteRepository.ts, so a
// ---- backup taken here and one taken from the app agree field for field.
const roleFromLabels = (labels) => ROLES.find((r) => labels.includes(r)) ?? "viewer";

function toUser(account, row) {
  return {
    id: account.$id,
    name: row.name,
    displayName: row.displayName ?? undefined,
    username: row.username ?? undefined,
    email: account.email,
    role: roleFromLabels(account.labels),
    active: account.status,
    createdAt: account.registration,
    lastLogin: row.lastLogin ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
  };
}

function toReport(row) {
  let data;
  try {
    data = JSON.parse(row.data);
  } catch {
    throw new Error(`Report ${row.date} holds data that could not be read.`);
  }
  return {
    id: row.$id,
    date: row.date,
    status: row.status,
    data,
    createdBy: row.createdBy ?? "",
    createdByName: row.createdByName,
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
    updatedByName: row.updatedByName ?? undefined,
  };
}

function toShipment(row) {
  return {
    id: row.$id,
    date: row.date,
    amountMt: Number(row.amountMt) || 0,
    note: row.note ?? undefined,
    createdBy: row.createdBy ?? "",
    createdByName: row.createdByName,
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
  };
}

function toSettings(row) {
  return {
    defaultTheme: row.defaultTheme,
    cementOpeningBalance:
      row.cementOpeningBalance === null ? undefined : Number(row.cementOpeningBalance),
    cementOpeningDate: row.cementOpeningDate ?? undefined,
  };
}

// -----------------------------------------------------------------------------
console.log(`\nCPSM backup ← ${endpoint} (project ${projectId})\n`);

const [profileRows, reportRows, shipmentRows, settingsRow, accounts] =
  await Promise.all([
    listAllRows("profiles"),
    listAllRows("reports"),
    listAllRows("shipments"),
    tables.getRow({ databaseId: DATABASE_ID, tableId: "settings", rowId: "app" }),
    listAllAccounts(),
  ]);

const profilesById = new Map(profileRows.map((r) => [r.$id, r]));

// An account with no profile row was created outside the app and cannot sign
// in, so it is not a CPSM user — but it is worth saying so out loud rather than
// dropping it silently from a file labelled "full backup".
const orphanAccounts = accounts.filter((a) => !profilesById.has(a.$id));

const db = {
  version: 3,
  users: accounts
    .filter((a) => profilesById.has(a.$id))
    .map((a) => toUser(a, profilesById.get(a.$id)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  // Sorted by date so two backups of the same data produce the same file and
  // any diff between them is a real change.
  reports: reportRows.map(toReport).sort((a, b) => a.date.localeCompare(b.date)),
  shipments: shipmentRows.map(toShipment).sort((a, b) => a.date.localeCompare(b.date)),
  settings: toSettings(settingsRow),
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const file = resolve(OUT_DIR, `appwrite-${stamp}.json`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(file, JSON.stringify(db, null, 2), "utf8");

// ---- Verify: read the file back off disk rather than trusting the object we
// ---- just held in memory. The point is to prove the bytes on disk are usable.
const reloaded = JSON.parse(readFileSync(file, "utf8"));

const checks = [
  ["users", reloaded.users?.length, db.users.length],
  ["reports", reloaded.reports?.length, db.reports.length],
  ["shipments", reloaded.shipments?.length, db.shipments.length],
  ["settings", reloaded.settings ? 1 : 0, 1],
];

let failed = false;
for (const [label, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(10)} ${got} / ${want}`);
}

// The bin card derives every balance from this anchor, so an export that lost
// it would restore into a plausible-looking but wrong stock ledger.
const anchor = reloaded.settings?.cementOpeningBalance;
if (anchor === undefined) {
  console.log("  warn  no cement opening balance is set on this project");
} else {
  console.log(
    `  ok    opening   ${anchor} MT @ ${reloaded.settings.cementOpeningDate ?? "no date"}`,
  );
}

if (orphanAccounts.length) {
  console.log(
    `\n  note  ${orphanAccounts.length} Appwrite account(s) have no profile row and are` +
      ` not CPSM users:\n        ${orphanAccounts.map((a) => a.email).join(", ")}`,
  );
}

const bytes = readFileSync(file).length;
console.log(`\n  ${file}\n  ${(bytes / 1024).toFixed(1)} KB\n`);

if (failed) {
  console.error("Backup did not verify. Do not proceed with the migration.\n");
  process.exit(1);
}
console.log("Backup verified. Copy it somewhere that is not this laptop.\n");
