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

const admins = await users.list({ queries: [Query.contains("labels", "admin")] });
const author = admins.users.find((u) => u.status);
if (!author) {
  console.error(
    "\nNo enabled administrator found. Run npm run appwrite:bootstrap first.\n",
  );
  process.exit(1);
}

let authorName = author.name;
try {
  const profile = await tables.getRow({
    databaseId: DATABASE_ID,
    tableId: "profiles",
    rowId: author.$id,
  });
  authorName = profile.name || authorName;
} catch {
  /* fall back to the account name */
}

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
    createdBy: author.$id,
    createdByName: authorName,
    updatedByName: authorName,
    // An API key may backdate a row; the app's own timestamps stay automatic.
    $createdAt: "2026-07-12T09:15:00.000+00:00",
    $updatedAt: "2026-07-12T09:15:00.000+00:00",
  },
});

console.log(`\nSeeded the master report for ${DATE}.\n`);
