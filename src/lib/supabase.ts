import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** True when both env vars are present, i.e. the app can talk to Supabase. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const TABLE_PROFILES = "profiles";
export const TABLE_REPORTS = "reports";
export const TABLE_SETTINGS = "settings";
export const TABLE_SHIPMENTS = "shipments";

/** The settings table holds exactly one row, under a fixed id. */
export const SETTINGS_ROW_ID = "app";

/** The privileged route for user management. Runs on the service key. */
export const ADMIN_ENDPOINT = "/api/admin-users";

const REMEMBER_KEY = "cpsm.auth.remember";

/**
 * Where the session is kept: localStorage when "remember me" is ticked,
 * sessionStorage when it is not.
 *
 * The browser does the work: a session written to sessionStorage is gone the
 * moment the tab closes, which is what "don't remember me" actually means, so
 * there is nothing to reconcile on boot.
 *
 * Reads check sessionStorage first so a non-remembered session always wins over
 * a stale remembered one, and writes clear the other store so exactly one copy
 * of the session exists at any time.
 */
interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const sessionStore: SessionStore = {
  getItem(key) {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  },
  setItem(key, value) {
    if (localStorage.getItem(REMEMBER_KEY) === "false") {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    }
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

/**
 * Record the choice before signing in.
 *
 * The storage adapter above reads this on every write, so it has to be set
 * before `signInWithPassword` stores the new session — otherwise the first
 * write lands in the wrong place.
 */
export function setRememberSession(remember: boolean): void {
  localStorage.setItem(REMEMBER_KEY, String(remember));
}

export function clearRememberSession(): void {
  localStorage.removeItem(REMEMBER_KEY);
}

/** The shared client, or null when the app has no Supabase configuration. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: sessionStore,
        persistSession: true,
        autoRefreshToken: true,
        // CPSM signs in with a password and never through a redirect, so there
        // is never a token in the URL to look for.
        detectSessionInUrl: false,
      },
    })
  : null;
