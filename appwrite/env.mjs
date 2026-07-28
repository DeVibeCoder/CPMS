// Shared environment loading for the appwrite/ scripts.
//
// These run under Node, not Vite, so nothing reads .env.local for us. The
// parser below is deliberately tiny: KEY=value, `#` comments, optional quotes.
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

export function requireEnv() {
  const endpoint = process.env.VITE_APPWRITE_ENDPOINT?.trim();
  const projectId = process.env.VITE_APPWRITE_PROJECT_ID?.trim();
  const apiKey = process.env.APPWRITE_API_KEY?.trim();

  const missing = [
    !endpoint && "VITE_APPWRITE_ENDPOINT",
    !projectId && "VITE_APPWRITE_PROJECT_ID",
    !apiKey && "APPWRITE_API_KEY",
  ].filter(Boolean);

  if (missing.length) {
    console.error(
      `\nMissing ${missing.join(", ")}.\n` +
        `Add them to .env.local — see .env.example.\n`,
    );
    process.exit(1);
  }
  return { endpoint, projectId, apiKey };
}
