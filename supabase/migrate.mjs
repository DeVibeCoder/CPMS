// =============================================================================
// Phase 3 — load an Appwrite export into Supabase.
//
//   npm run migrate:supabase                  use the newest backups/*.json
//   npm run migrate:supabase -- <file.json>   use a specific export
//
// Safe to re-run. Reports and shipments are upserted on their date, accounts are
// matched on email, so running it again after a fresh export picks up only what
// changed — which is exactly what the cutover does to capture the delta.
//
// It does not verify its own work. `npm run verify:supabase` is a separate
// program for that reason: a script that marks its own homework proves nothing.
// =============================================================================
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// ---- which export ----------------------------------------------------------
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
console.log(`\nCPSM migrate → ${VITE_SUPABASE_URL}`);
console.log(`  source  ${file}`);
console.log(
  `  holds   ${backup.users.length} users, ${backup.reports.length} reports, ` +
    `${backup.shipments?.length ?? 0} shipments\n`,
);

// ---- accounts --------------------------------------------------------------
//
// Appwrite ids are not UUIDs and auth.users.id must be one, so the three account
// ids necessarily change. Everything that referenced them is remapped by email
// below; created_by_name — the field the UI actually displays — is copied
// verbatim, so nothing visible moves.

/** Readable by design: somebody has to type these once. No l/1/O/0. */
function password() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(20)].map((b) => alphabet[b % alphabet.length]).join("");
}

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  for (const u of data.users) existing.set(u.email?.toLowerCase(), u);
  if (data.users.length < 100) break;
}

/** old Appwrite user id → new Supabase uuid */
const idMap = new Map();
const issued = [];

console.log("Accounts");
for (const user of backup.users) {
  const email = user.email.toLowerCase();
  let account = existing.get(email);

  if (account) {
    console.log(`  exists   ${email}  (${user.role})`);
  } else {
    const pw = password();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: pw,
      // No mail flow in a plant app: an administrator creating the account is
      // the confirmation.
      email_confirm: true,
      app_metadata: { role: user.role },
      user_metadata: { name: user.name },
      ban_duration: user.active ? undefined : "876000h",
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    account = data.user;
    issued.push({ email, role: user.role, password: pw });
    console.log(`  created  ${email}  (${user.role})`);
  }

  idMap.set(user.id, account.id);

  const { error } = await db.from("profiles").upsert({
    id: account.id,
    name: user.name,
    display_name: user.displayName ?? null,
    username: user.username ?? null,
    avatar_color: user.avatarColor ?? null,
    avatar_url: user.avatarUrl ?? null,
    last_login: user.lastLogin ?? null,
    created_at: user.createdAt,
  });
  if (error) throw new Error(`profile ${email}: ${error.message}`);
}

// ---- reports ---------------------------------------------------------------
//
// Ids carry across verbatim so /reports/:id bookmarks keep working and the
// verifier can compare the two databases row for row. Original timestamps are
// written explicitly: the updated_at trigger fires on UPDATE, not INSERT, so a
// migrated report keeps the day it was actually filed.
console.log("\nReports");
const reportRows = backup.reports.map((r) => ({
  id: r.id,
  date: r.date,
  status: r.status,
  data: r.data,
  created_by: idMap.get(r.createdBy) ?? null,
  created_by_name: r.createdByName,
  updated_by_name: r.updatedByName ?? null,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
}));

for (let i = 0; i < reportRows.length; i += 100) {
  const chunk = reportRows.slice(i, i + 100);
  const { error } = await db.from("reports").upsert(chunk, { onConflict: "date" });
  if (error) throw new Error(`reports: ${error.message}`);
  console.log(`  wrote    ${i + chunk.length} / ${reportRows.length}`);
}

// ---- shipments -------------------------------------------------------------
console.log("\nShipments");
const shipmentRows = (backup.shipments ?? []).map((s) => ({
  id: s.id,
  date: s.date,
  amount_mt: s.amountMt,
  note: s.note ?? null,
  created_by: idMap.get(s.createdBy) ?? null,
  created_by_name: s.createdByName,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
}));

if (shipmentRows.length) {
  const { error } = await db
    .from("shipments")
    .upsert(shipmentRows, { onConflict: "date" });
  if (error) throw new Error(`shipments: ${error.message}`);
}
console.log(`  wrote    ${shipmentRows.length}`);

// ---- settings --------------------------------------------------------------
//
// The opening balance is the bin-card anchor: every later balance is derived
// from it by walking finalised reports forward, so this one row matters as much
// as all forty reports.
console.log("\nSettings");
const { error: settingsError } = await db
  .from("settings")
  .update({
    default_theme: backup.settings.defaultTheme,
    cement_opening_balance: backup.settings.cementOpeningBalance ?? null,
    cement_opening_date: backup.settings.cementOpeningDate ?? null,
  })
  .eq("id", "app");
if (settingsError) throw new Error(`settings: ${settingsError.message}`);
console.log(
  `  wrote    opening ${backup.settings.cementOpeningBalance ?? "none"} MT @ ` +
    `${backup.settings.cementOpeningDate ?? "no date"}`,
);

// ---- credentials -----------------------------------------------------------
if (issued.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const out = resolve(BACKUPS, `supabase-passwords-${stamp}.txt`);
  writeFileSync(
    out,
    "CPSM — Supabase sign-in details\n" +
      "Generated by npm run migrate:supabase. Hand these over in person and\n" +
      "delete this file afterwards; anyone can change their own password in\n" +
      "the app under Profile.\n\n" +
      issued.map((i) => `${i.role.padEnd(9)} ${i.email}\n          ${i.password}`).join("\n\n") +
      "\n",
    "utf8",
  );
  console.log(`\n  ${issued.length} new password(s) written to\n  ${out}`);
}

console.log("\nDone. Next: npm run verify:supabase\n");
