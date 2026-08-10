import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabaseRepository";
import { supabase } from "@/lib/supabase";

/**
 * The single data access point for the whole application.
 *
 * CPSM talks to Supabase and nothing else. There is no offline store and no
 * seeded demo data: every account, report and setting lives in the backend, so
 * what one person saves is what everyone else sees.
 *
 * Nothing outside this file imports a concrete repository.
 */
export const isBackendConfigured = supabase !== null;

export const BACKEND_NOT_CONFIGURED =
  "CPSM is not connected to a backend. Set VITE_SUPABASE_URL and " +
  "VITE_SUPABASE_ANON_KEY, then rebuild — Vite reads them at build time.";

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

export const repo: Repository = supabase
  ? new SupabaseRepository(supabase)
  : unconfigured();

export type { Repository } from "./repository";
