// Environment loading for the supabase/ scripts.
//
// A near-copy of appwrite/env.mjs rather than an import from it: that directory
// is deleted at the end of the migration, and a script that outlives it should
// not reach into it. The parser is deliberately tiny — KEY=value, `#` comments,
// optional quotes.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = [".env.local", ".env"];
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv(root = REPO_ROOT) {
  for (const file of FILES) {
    let text;
    try {
      text = readFileSync(resolve(root, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
      // First file wins, and a real environment variable beats both.
      if (process.env[match[1]] === undefined && value !== "") {
        process.env[match[1]] = value;
      }
    }
  }
}

/**
 * Read the named variables, or explain precisely what is missing and stop.
 *
 * Scripts here touch the plant's database, so a half-configured run is worse
 * than no run at all.
 */
export function requireEnv(...names) {
  const found = {};
  const missing = [];
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) found[name] = value;
    else missing.push(name);
  }
  if (missing.length) {
    console.error(
      `\nMissing ${missing.join(", ")}.\n` +
        `Add them to .env.local — see .env.example.\n`,
    );
    process.exit(1);
  }
  return found;
}
