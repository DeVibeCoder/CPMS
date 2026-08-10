// =============================================================================
// Apply supabase/migrations/ to the remote database.
//
//   npm run db:push           apply anything not yet recorded as applied
//   npm run db:push -- --dry-run    show what would run, change nothing
//
// Wraps `supabase db push` for one reason: the connection string carries the
// database password, so it is read from .env.local rather than typed into a
// shell where it would land in history. Everything else is the CLI's own work,
// including the migration history table that stops a migration running twice.
// =============================================================================
import { spawnSync } from "node:child_process";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { SUPABASE_DB_URL } = requireEnv("SUPABASE_DB_URL");

// The password sits between "postgres." and "@". Everything this script prints
// keeps it hidden, so a copied terminal transcript is not a credential leak.
const masked = SUPABASE_DB_URL.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:••••••@");
console.log(`\nsupabase db push → ${masked}\n`);

const passthrough = process.argv.slice(2);

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "db", "push", "--db-url", SUPABASE_DB_URL, "--yes", ...passthrough],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`\nCould not run the Supabase CLI: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
