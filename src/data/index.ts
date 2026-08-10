import type { Repository } from "./repository";
import { AppwriteRepository } from "./appwriteRepository";
import { SupabaseRepository } from "./supabaseRepository";
import { client } from "@/lib/appwrite";
import { supabase } from "@/lib/supabase";

/**
 * The single data access point for the whole application.
 *
 * CPSM talks to one backend and nothing else. There is no offline store and no
 * seeded demo data: every account, report and setting lives in the backend, so
 * what one person saves is what everyone else sees.
 *
 * Nothing outside this file imports a concrete repository.
 *
 * ---------------------------------------------------------------------------
 * The two backends coexist for the length of the Appwrite → Supabase migration.
 * `VITE_BACKEND` chooses between them and defaults to Appwrite, so a build that
 * says nothing keeps behaving exactly as it did before. That default is what
 * makes the cutover — and the way back from it — a single environment variable
 * rather than a code change under time pressure.
 *
 * Both implementations are deleted down to one at the end of the migration.
 * ---------------------------------------------------------------------------
 */
export type Backend = "appwrite" | "supabase";

export const backend: Backend =
  import.meta.env.VITE_BACKEND?.trim().toLowerCase() === "supabase"
    ? "supabase"
    : "appwrite";

const active = backend === "supabase" ? supabase : client;

export const isBackendConfigured = active !== null;

export const BACKEND_NOT_CONFIGURED =
  backend === "supabase"
    ? "CPSM is not connected to a backend. Set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY, then rebuild — Vite reads them at build time."
    : "CPSM is not connected to a backend. Set VITE_APPWRITE_ENDPOINT and " +
      "VITE_APPWRITE_PROJECT_ID, then rebuild — Vite reads them at build time.";

/**
 * Stand-in for a missing configuration. `App` renders a setup screen when
 * `isBackendConfigured` is false, so this should never be reached; it exists so
 * that a stray call fails loudly rather than resolving with empty data and
 * looking like an empty database.
 */
function unconfigured(): Repository {
  return new Proxy({} as Repository, {
    get() {
      return () => Promise.reject(new Error(BACKEND_NOT_CONFIGURED));
    },
  });
}

export const repo: Repository =
  backend === "supabase"
    ? supabase
      ? new SupabaseRepository(supabase)
      : unconfigured()
    : client
      ? new AppwriteRepository(client)
      : unconfigured();

export type { Repository } from "./repository";
