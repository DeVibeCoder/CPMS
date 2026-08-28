// =============================================================================
// Apply supabase/migrations/ through the Supabase Management API.
//
//   npm run db:migrate               apply everything not yet applied
//   npm run db:migrate -- --dry-run  list what would run, change nothing
//   npm run db:migrate -- --print    print the SQL instead of running it
//
// Why not `supabase db push`: that connects straight to Postgres, which needs
// the database password and either an IPv6 route to db.<ref>.supabase.co or the
// right pooler host. The Management API needs neither — it runs the SQL
// server-side against the project the access token already identifies.
//
// Applied migrations are recorded in supabase_migrations.schema_migrations, the
// same table the CLI uses, so `supabase db push` stays usable later and will not
// re-run anything applied here.
//
// Each migration is wrapped in a transaction together with its own history row,
// so a failure half way through a file leaves neither the schema nor the history
// partly changed.
//
// --print exists because an access token is a thing you have to go and create,
// and revoke afterwards, and a migration should not be blocked on that errand.
// It emits exactly what this script would have run — transaction, migration,
// history row — to paste into the dashboard's SQL editor. Same statements, same
// history, so `db:migrate` afterwards knows the work is done and will not offer
// to do it twice. It reads no environment and opens no connection.
// =============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const dryRun = process.argv.includes("--dry-run");
const printOnly = process.argv.includes("--print");

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** One migration, wrapped exactly as `sql()` below would send it. */
function transaction(file) {
  const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(file);
  return (
    `begin;\n${readFileSync(resolve(DIR, file), "utf8")}\n` +
    `insert into supabase_migrations.schema_migrations (version, name)\n` +
    `  values (${quote(version)}, ${quote(name)});\n` +
    `commit;`
  );
}

// Printing needs no project and no token, so it is answered before either is
// asked for — the whole point is that it works when you have neither to hand.
if (printOnly) {
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => named.length === 0 || named.some((n) => f.includes(n)));

  if (files.length === 0) {
    console.error(`\nNo migration matches ${named.join(", ")}.\n`);
    process.exit(1);
  }

  console.error(
    `\n-- Paste into the Supabase dashboard's SQL editor and run.\n` +
      `-- Creates the history row too, so db:migrate will not re-run it.\n` +
      `-- Files: ${files.join(", ")}\n`,
  );
  console.log(files.map(transaction).join("\n\n"));
  process.exit(0);
}

const { SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL } = requireEnv(
  "SUPABASE_ACCESS_TOKEN",
  "VITE_SUPABASE_URL",
);

const REF = new URL(VITE_SUPABASE_URL).hostname.split(".")[0];

/** Run SQL server-side. Throws with whatever Postgres actually said. */
async function sql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const body = JSON.parse(text);
      detail = body.message ?? body.error ?? text;
    } catch {
      /* not JSON — the raw body is the best message available */
    }
    throw new Error(detail);
  }
  return text ? JSON.parse(text) : [];
}


// -----------------------------------------------------------------------------
console.log(`\nCPSM migrations → project ${REF}\n`);

await sql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version    text primary key,
    statements text[],
    name       text
  );
`);

const applied = new Set(
  (await sql("select version from supabase_migrations.schema_migrations;")).map(
    (r) => r.version,
  ),
);

// Lexicographic order is chronological order: the filenames are timestamps.
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const pending = [];
for (const file of files) {
  const match = /^(\d+)_(.+)\.sql$/.exec(file);
  if (!match) {
    console.error(
      `  skip     ${file} — not <timestamp>_<name>.sql, so it has no version`,
    );
    continue;
  }
  const [, version, name] = match;
  if (applied.has(version)) {
    console.log(`  applied  ${version}  ${name}`);
  } else {
    pending.push({ file, version, name });
  }
}

if (pending.length === 0) {
  console.log("\nNothing to do — the database is up to date.\n");
  process.exit(0);
}

if (dryRun) {
  console.log("\nWould apply:");
  for (const { version, name, file } of pending) {
    const lines = readFileSync(resolve(DIR, file), "utf8").split("\n").length;
    console.log(`  ${version}  ${name}  (${lines} lines)`);
  }
  console.log("\nDry run — nothing was changed.\n");
  process.exit(0);
}

for (const { file, version, name } of pending) {
  const body = readFileSync(resolve(DIR, file), "utf8");
  process.stdout.write(`  running  ${version}  ${name} … `);
  try {
    await sql(
      `begin;\n${body}\n` +
        `insert into supabase_migrations.schema_migrations (version, name)\n` +
        `  values (${quote(version)}, ${quote(name)});\n` +
        `commit;`,
    );
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    console.error(`\n${file}:\n  ${e.message}\n`);
    console.error("Nothing from this migration was applied — the transaction rolled back.\n");
    process.exit(1);
  }
}

console.log(`\nApplied ${pending.length} migration(s).\n`);
