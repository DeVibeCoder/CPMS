// =============================================================================
// CPSM — Appwrite free-plan keepalive.
//
// Appwrite pauses Free plan projects after 7 consecutive days without
// "development activity in the Console" (policy change of 2026-02-20). Appwrite
// have stated that runtime traffic — API calls, SDK usage, end-user visits —
// does NOT count, so the plant using the app every day is not enough to keep
// the backend alive. That is what paused this project once already.
//
// What counts is not documented. This script therefore does the closest thing
// to console work that can be driven from an API key: a real schema change.
// It creates a throwaway table and deletes it again, which is the same
// control-plane endpoint the Console calls when you add a collection by hand.
//
// HONEST CAVEAT: this is a best guess at an undocumented signal. It may not be
// enough. That is why isProjectReachable() exists and why the app now says
// "backend unavailable" instead of "invalid password" — if this stops working
// you find out on the next login, not a week later.
//
//   npm run appwrite:keepalive     (manual run — also the fallback if the
//                                   Vercel cron ever stops firing)
// =============================================================================
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, TablesDB } from "node-appwrite";

/** Id of the scratch table. Fixed, so a leftover can always be cleaned up. */
const TOUCH_TABLE_ID = "keepalive";

function connect({ endpoint, projectId, apiKey }) {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  return new TablesDB(client);
}

/** Appwrite answers 404 for "already gone", which is the desired end state. */
async function deleteIfPresent(tables, databaseId) {
  try {
    await tables.deleteTable({ databaseId, tableId: TOUCH_TABLE_ID });
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

/**
 * Perform one schema write against the project.
 *
 * Deliberately create-then-delete rather than a no-op read: a read is runtime
 * traffic, which we know does not count. Creating a resource is the strongest
 * "someone is developing here" signal an API key can produce.
 *
 * The table is created with no columns and no permissions, so even if a run
 * dies between the create and the delete, what is left behind is an empty,
 * unreadable table that the next run removes.
 */
export async function touchProject({
  endpoint,
  projectId,
  apiKey,
  databaseId,
}) {
  const tables = connect({ endpoint, projectId, apiKey });

  // A leftover from a half-finished previous run would make createTable 409.
  const hadLeftover = await deleteIfPresent(tables, databaseId);

  await tables.createTable({
    databaseId,
    tableId: TOUCH_TABLE_ID,
    name: "Keepalive (transient)",
    rowSecurity: false,
    permissions: [],
  });

  await deleteIfPresent(tables, databaseId);

  return { touchedAt: new Date().toISOString(), hadLeftover };
}

/**
 * Whether the project answers at all.
 *
 * A paused project stops serving the API, so this is how the cron distinguishes
 * "kept it alive" from "too late, already paused" and reports the difference.
 */
export async function isProjectReachable({ endpoint, projectId, apiKey }) {
  try {
    await connect({ endpoint, projectId, apiKey }).list();
    return true;
  } catch (e) {
    // 401/403 still means the project is up — it answered. Only a transport
    // failure or a 5xx says otherwise.
    if (e.code && e.code < 500) return true;
    return false;
  }
}

export { TOUCH_TABLE_ID };

// --- CLI ---------------------------------------------------------------------
// Only when run directly (`npm run appwrite:keepalive`), never on import.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { loadEnv, requireEnv } = await import("./env.mjs");
  loadEnv();
  const { endpoint, projectId, apiKey } = requireEnv();
  const databaseId = process.env.VITE_APPWRITE_DATABASE_ID || "cpsm";

  try {
    const { hadLeftover } = await touchProject({
      endpoint,
      projectId,
      apiKey,
      databaseId,
    });
    if (hadLeftover) {
      console.log("  cleaned  leftover keepalive table from a previous run");
    }
    console.log(`  touched  ${databaseId} — schema activity recorded`);
  } catch (e) {
    console.error(`\nKeepalive failed: ${e.message}`);
    if (!(await isProjectReachable({ endpoint, projectId, apiKey }))) {
      console.error(
        "The project is not answering — it may already be paused.\n" +
          "Restore it at https://cloud.appwrite.io/console\n",
      );
    }
    process.exit(1);
  }
}
