// =============================================================================
// Optional: seed the 12/07/2026 master report.
//
// These are the exact figures from the plant's source document, the ones the
// generated PDF is compared against. Run it after appwrite:bootstrap if you
// want that reference report present in a new backend.
//
//   npm run appwrite:seed
// =============================================================================
import { Client, ID, Query, TablesDB, Users } from "node-appwrite";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { endpoint, projectId, apiKey } = requireEnv();
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "cpsm";
const DATE = "2026-07-12";

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);
const tables = new TablesDB(client);
const users = new Users(client);

/**
 * Find someone to credit the report to.
 *
 * A role is an account label, so naming an *admin* specifically needs the Auth
 * scope. That is more privilege than seeding warrants — the author is only
 * attribution — so a Databases-only key falls back to the profiles table, which
 * only ever contains provisioned users anyway.
 */
async function findAuthor() {
  try {
    const admins = await users.list({
      queries: [Query.contains("labels", "admin")],
    });
    const admin = admins.users.find((u) => u.status);
    if (admin) {
      let name = admin.name;
      try {
        const profile = await tables.getRow({
          databaseId: DATABASE_ID,
          tableId: "profiles",
          rowId: admin.$id,
        });
        name = profile.name || name;
      } catch {
        /* keep the account name */
      }
      return { id: admin.$id, name };
    }
  } catch (e) {
    if (e.code !== 401) throw e;
    console.log("(key has no Auth scope — taking the author from profiles)");
  }

  const rows = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: "profiles",
    queries: [Query.limit(1)],
  });
  const profile = rows.rows[0];
  return profile ? { id: profile.$id, name: profile.name } : null;
}

const author = await findAuthor();
if (!author) {
  console.error(
    "\nNo user found to credit. Run npm run appwrite:bootstrap first.\n",
  );
  process.exit(1);
}
const authorName = author.name;

const existing = await tables.listRows({
  databaseId: DATABASE_ID,
  tableId: "reports",
  queries: [Query.equal("date", DATE), Query.limit(1)],
});
if (existing.rows.length > 0) {
  console.log(`\nA report already exists for ${DATE}. Nothing to do.\n`);
  process.exit(0);
}

const data = {
  bags50kg: { cementJetty: 550, godown: 5090, qMarineJetty: 0 },
  jumbo: { cementJetty: 182, totalCementMt: 250 },
  silo: { currentStock: 7023.99, sales: 554.5, production: 395.5 },
  emptyBags50kg: {
    china: { plant01: 22798, plant02: 50813, plant03: 17267, gStore: 70000 },
    indonesia: { plant01: 16675, plant02: 2995, plant03: 9124, gStore: 480000 },
  },
  emptyJumbo: { cementGodown: 273, cementJetty: 0, gStore: 3900 },
  netSlings: {
    new: { cementGodown: 9546, gStore: 0 },
    used: { cementGodown: 3418, gStore: 0 },
  },
  notes: "",
};

await tables.createRow({
  databaseId: DATABASE_ID,
  tableId: "reports",
  rowId: ID.unique(),
  data: {
    date: DATE,
    status: "final",
    data: JSON.stringify(data),
    createdBy: author.id,
    createdByName: authorName,
    updatedByName: authorName,
    // An API key may backdate a row; the app's own timestamps stay automatic.
    $createdAt: "2026-07-12T09:15:00.000+00:00",
    $updatedAt: "2026-07-12T09:15:00.000+00:00",
  },
});

console.log(`\nSeeded the master report for ${DATE}.\n`);
