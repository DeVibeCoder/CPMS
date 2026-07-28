// =============================================================================
// CPSM — Appwrite schema setup.
//
// Creates the database, tables, columns, indexes and permissions the app needs.
// Appwrite has no SQL migrations, so this script is the schema: it is
// idempotent and safe to re-run against an existing project.
//
//   npm run appwrite:setup
//
// Requires VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID and APPWRITE_API_KEY
// in .env.local (see .env.example).
// =============================================================================
import { Client, Permission, Role, TablesDB } from "node-appwrite";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { endpoint, projectId, apiKey } = requireEnv();
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "cpsm";

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const tables = new TablesDB(client);

/** Appwrite answers 409 for "already there", which is exactly what we want. */
async function ensure(label, fn) {
  try {
    await fn();
    console.log(`  created  ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  exists   ${label}`);
    else throw new Error(`${label}: ${e.message}`);
  }
}

/**
 * Create a table, or bring an existing one back in line with this file.
 *
 * Permissions are reconciled on every run, not just at creation. A schema that
 * only applies on first run is a schema that silently drifts: tightening a rule
 * here would otherwise never reach a project that already exists.
 */
async function ensureTable(tableId, name, rowSecurity, permissions) {
  try {
    await tables.createTable({
      databaseId: DATABASE_ID,
      tableId,
      name,
      rowSecurity,
      permissions,
    });
    console.log(`  created  ${tableId}`);
  } catch (e) {
    if (e.code !== 409) throw new Error(`${tableId}: ${e.message}`);
    await tables.updateTable({
      databaseId: DATABASE_ID,
      tableId,
      name,
      rowSecurity,
      permissions,
    });
    console.log(`  exists   ${tableId} (permissions reconciled)`);
  }
}

/**
 * Columns are created asynchronously; an index over a column that is still
 * "processing" fails. Wait for the whole table to settle before indexing.
 */
async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { columns } = await tables.listColumns({
      databaseId: DATABASE_ID,
      tableId,
    });
    if (columns.every((c) => c.status === "available")) return;
    const failed = columns.filter((c) => c.status === "failed");
    if (failed.length) {
      throw new Error(
        `Columns failed to create on ${tableId}: ${failed.map((c) => c.key).join(", ")}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Columns on ${tableId} did not become available in time.`);
}

const str = (tableId, key, size, required, extra = {}) =>
  ensure(`${tableId}.${key}`, () =>
    tables.createStringColumn({
      databaseId: DATABASE_ID,
      tableId,
      key,
      size,
      required,
      ...extra,
    }),
  );

console.log(`\nCPSM → ${endpoint} (project ${projectId})\n`);

// -----------------------------------------------------------------------------
// Look before creating. A project already at its plan's database limit answers
// the create call with "maximum number of databases reached" rather than a 409,
// so treating 409 as the only "already there" signal would fail every re-run on
// the free plan.
// -----------------------------------------------------------------------------
console.log("Database");
try {
  await tables.get({ databaseId: DATABASE_ID });
  console.log(`  exists   ${DATABASE_ID}`);
} catch (e) {
  if (e.code !== 404) throw new Error(`${DATABASE_ID}: ${e.message}`);
  await ensure(DATABASE_ID, () =>
    tables.create({ databaseId: DATABASE_ID, name: "CPSM" }),
  );
}

// -----------------------------------------------------------------------------
// profiles — the editable part of a user record.
//
// Row security is on: each row is created by the admin-users function with read
// and update permissions for its owner, so people can edit their own name and
// avatar. Administrators reach every row through the table permissions below.
//
// Nothing privileged is stored here. A role is an account *label* and "active"
// is the account's own enabled flag, neither of which a client can change — so
// a user with write access to their own row still cannot promote themselves.
// -----------------------------------------------------------------------------
console.log("\nTable: profiles");
await ensureTable("profiles", "Profiles", true, [
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
]);
await str("profiles", "name", 128, true);
await str("profiles", "displayName", 128, false);
await str("profiles", "username", 64, false);
await str("profiles", "avatarColor", 32, false);
// Profile pictures are stored inline as data URLs, so this needs real room.
await str("profiles", "avatarUrl", 1000000, false);
await ensure("profiles.lastLogin", () =>
  tables.createDatetimeColumn({
    databaseId: DATABASE_ID,
    tableId: "profiles",
    key: "lastLogin",
    required: false,
  }),
);

// -----------------------------------------------------------------------------
// reports — one row per report date.
//
// viewer  reads; dispatch also creates and updates; only admin deletes.
//
// Read is granted to the three role labels, never to `Role.users()`. Appwrite
// projects allow public sign-up by default, and a self-registered account is
// still a "user" — it would have inherited read access to every report while
// being unable to sign into the app at all. Requiring a label means an account
// nobody deliberately provisioned can read nothing.
// -----------------------------------------------------------------------------
console.log("\nTable: reports");
await ensureTable("reports", "Reports", false, [
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("dispatch")),
  Permission.read(Role.label("viewer")),
  Permission.create(Role.label("admin")),
  Permission.create(Role.label("dispatch")),
  Permission.update(Role.label("admin")),
  Permission.update(Role.label("dispatch")),
  Permission.delete(Role.label("admin")),
]);
await str("reports", "date", 10, true);
await ensure("reports.status", () =>
  tables.createEnumColumn({
    databaseId: DATABASE_ID,
    tableId: "reports",
    key: "status",
    elements: ["draft", "final"],
    required: true,
  }),
);
// The whole ReportData object as JSON, so the report shape can evolve without
// touching the schema.
await str("reports", "data", 100000, true);
await str("reports", "createdBy", 36, false);
await str("reports", "createdByName", 128, true);
await str("reports", "updatedByName", 128, false);

// -----------------------------------------------------------------------------
console.log("\nTable: settings");
await ensureTable("settings", "Settings", false, [
  // Same reasoning as reports: a label, not merely a session.
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("dispatch")),
  Permission.read(Role.label("viewer")),
  Permission.update(Role.label("admin")),
]);
await str("settings", "companyName", 128, true);
await str("settings", "reportTitle", 128, true);
await str("settings", "pdfHeader", 256, true);
await str("settings", "pdfFooter", 256, true);
await str("settings", "logoDataUrl", 1000000, false);
await ensure("settings.bagWeightMt", () =>
  tables.createFloatColumn({
    databaseId: DATABASE_ID,
    tableId: "settings",
    key: "bagWeightMt",
    required: true,
  }),
);
await ensure("settings.defaultTheme", () =>
  tables.createEnumColumn({
    databaseId: DATABASE_ID,
    tableId: "settings",
    key: "defaultTheme",
    elements: ["light", "dark", "system"],
    required: true,
  }),
);

// -----------------------------------------------------------------------------
console.log("\nIndexes");
for (const tableId of ["profiles", "reports", "settings"]) {
  await waitForColumns(tableId);
}
// One report per day is the rule, enforced here rather than in the UI.
await ensure("reports.date (unique)", () =>
  tables.createIndex({
    databaseId: DATABASE_ID,
    tableId: "reports",
    key: "date_unique",
    type: "unique",
    columns: ["date"],
  }),
);

// -----------------------------------------------------------------------------
console.log("\nSettings row");
await ensure("settings/app", () =>
  tables.createRow({
    databaseId: DATABASE_ID,
    tableId: "settings",
    rowId: "app",
    data: {
      companyName: "Cement Plant Industries",
      reportTitle: "CEMENT STOCK",
      pdfHeader: "Daily Stock Report",
      pdfFooter: "Confidential — Generated by CPSM",
      logoDataUrl: null,
      bagWeightMt: 0.05,
      defaultTheme: "system",
    },
  }),
);

console.log("\nDone. Next: npm run appwrite:bootstrap -- <email> <password>\n");
