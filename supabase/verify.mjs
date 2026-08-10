// =============================================================================
// Phase 3 — prove the migration landed.
//
//   npm run verify:supabase                  check against the newest backup
//   npm run verify:supabase -- <file.json>   check against a specific export
//
// Deliberately a separate program from migrate.mjs, reading the Appwrite export
// and the live Supabase tables independently and comparing them field by field.
// A migrator that checks its own work only proves it is internally consistent.
//
// Exits non-zero on any mismatch. That is the point: it is meant to be the thing
// that stops a cutover, not a report somebody reads afterwards.
// =============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireEnv(
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
);

const BACKUPS = resolve(process.cwd(), "backups");
const db = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const arg = process.argv[2];
const file = arg
  ? resolve(arg)
  : resolve(
      BACKUPS,
      readdirSync(BACKUPS)
        .filter((f) => f.startsWith("appwrite-") && f.endsWith(".json"))
        .sort()
        .pop() ?? "",
    );

const backup = JSON.parse(readFileSync(file, "utf8"));

const problems = [];
const fail = (what) => problems.push(what);

/** Count of problems recorded so far, so a section can report its own verdict. */
const mark = () => problems.length;
const cleanSince = (n) => problems.length === n;

/** Key order differs between stores; the value is what has to match. */
const stable = (v) =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

console.log(`\nCPSM verify → ${VITE_SUPABASE_URL}`);
console.log(`  against ${file}\n`);

// ---- reports ---------------------------------------------------------------
const { data: reports, error: reportsError } = await db
  .from("reports")
  .select("*")
  .order("date");
if (reportsError) throw new Error(`reports: ${reportsError.message}`);

if (reports.length !== backup.reports.length) {
  fail(`report count: Supabase has ${reports.length}, the export has ${backup.reports.length}`);
}

const byDate = new Map(reports.map((r) => [r.date, r]));
for (const want of backup.reports) {
  const got = byDate.get(want.date);
  if (!got) {
    fail(`report ${want.date}: missing from Supabase`);
    continue;
  }
  if (got.id !== want.id) fail(`report ${want.date}: id ${got.id} ≠ ${want.id}`);
  if (got.status !== want.status) {
    fail(`report ${want.date}: status ${got.status} ≠ ${want.status}`);
  }
  if (got.created_by_name !== want.createdByName) {
    fail(`report ${want.date}: author ${got.created_by_name} ≠ ${want.createdByName}`);
  }
  if ((got.updated_by_name ?? undefined) !== (want.updatedByName ?? undefined)) {
    fail(`report ${want.date}: editor ${got.updated_by_name} ≠ ${want.updatedByName}`);
  }
  // The report body itself — every bag count, silo figure and sling row.
  if (stable(got.data) !== stable(want.data)) {
    fail(`report ${want.date}: the report data does not match`);
  }
}

// ---- shipments -------------------------------------------------------------
const { data: shipments, error: shipmentsError } = await db
  .from("shipments")
  .select("*")
  .order("date");
if (shipmentsError) throw new Error(`shipments: ${shipmentsError.message}`);

const wantShipments = backup.shipments ?? [];
if (shipments.length !== wantShipments.length) {
  fail(`shipment count: Supabase has ${shipments.length}, the export has ${wantShipments.length}`);
}
const shipByDate = new Map(shipments.map((s) => [s.date, s]));
for (const want of wantShipments) {
  const got = shipByDate.get(want.date);
  if (!got) {
    fail(`shipment ${want.date}: missing from Supabase`);
    continue;
  }
  if (Number(got.amount_mt) !== Number(want.amountMt)) {
    fail(`shipment ${want.date}: ${got.amount_mt} MT ≠ ${want.amountMt} MT`);
  }
  if ((got.note ?? undefined) !== (want.note ?? undefined)) {
    fail(`shipment ${want.date}: note differs`);
  }
  if (got.created_by_name !== want.createdByName) {
    fail(`shipment ${want.date}: author differs`);
  }
}

// ---- settings --------------------------------------------------------------
// The opening balance anchors the whole cement bin card, so it is checked as a
// number rather than by string equality.
const { data: settings, error: settingsError } = await db
  .from("settings")
  .select("*")
  .eq("id", "app")
  .single();
if (settingsError) throw new Error(`settings: ${settingsError.message}`);

const settingsMark = mark();
if (settings.default_theme !== backup.settings.defaultTheme) {
  fail(`settings: theme ${settings.default_theme} ≠ ${backup.settings.defaultTheme}`);
}
const gotOpening = settings.cement_opening_balance;
const wantOpening = backup.settings.cementOpeningBalance ?? null;
if (Number(gotOpening) !== Number(wantOpening)) {
  fail(`settings: opening balance ${gotOpening} ≠ ${wantOpening}`);
}
if ((settings.cement_opening_date ?? null) !== (backup.settings.cementOpeningDate ?? null)) {
  fail(`settings: opening date ${settings.cement_opening_date} ≠ ${backup.settings.cementOpeningDate}`);
}

// ---- accounts --------------------------------------------------------------
const accounts = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  accounts.push(...data.users);
  if (data.users.length < 100) break;
}
const { data: profiles, error: profilesError } = await db.from("profiles").select("*");
if (profilesError) throw new Error(`profiles: ${profilesError.message}`);

const byEmail = new Map(accounts.map((a) => [a.email?.toLowerCase(), a]));
const profileById = new Map(profiles.map((p) => [p.id, p]));

for (const want of backup.users) {
  const account = byEmail.get(want.email.toLowerCase());
  if (!account) {
    fail(`user ${want.email}: no Supabase account`);
    continue;
  }
  const role = account.app_metadata?.role;
  if (role !== want.role) fail(`user ${want.email}: role ${role} ≠ ${want.role}`);

  const banned = account.banned_until && new Date(account.banned_until) > new Date();
  if (!banned !== want.active) {
    fail(`user ${want.email}: active ${!banned} ≠ ${want.active}`);
  }
  const profile = profileById.get(account.id);
  if (!profile) fail(`user ${want.email}: no profile row, so they cannot sign in`);
  else if (profile.name !== want.name) {
    fail(`user ${want.email}: name ${profile.name} ≠ ${want.name}`);
  }
}

// ---- verdict ---------------------------------------------------------------
const counts = [
  ["reports", reports.length, backup.reports.length],
  ["shipments", shipments.length, wantShipments.length],
  ["users", accounts.length, backup.users.length],
  ["profiles", profiles.length, backup.users.length],
];
for (const [label, got, want] of counts) {
  console.log(`  ${got === want ? "ok  " : "FAIL"}  ${label.padEnd(10)} ${got} / ${want}`);
}
console.log(
  `  ${cleanSince(settingsMark) ? "ok  " : "FAIL"}  ${"settings".padEnd(10)} ` +
    `opening ${gotOpening} MT @ ${settings.cement_opening_date}`,
);

if (problems.length) {
  console.error(`\n${problems.length} mismatch(es):\n`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  console.error("\nDo not cut over.\n");
  process.exit(1);
}

console.log("\nEvery report, shipment, setting and account matches the export.\n");
