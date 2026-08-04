import { Account, Client, Functions, TablesDB } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT?.trim();
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim();

/** True when both env vars are present, i.e. the app should talk to Appwrite. */
export const isAppwriteConfigured = Boolean(endpoint && projectId);

/** Ids of the backend resources created by `appwrite/setup.mjs`. */
export const DATABASE_ID =
  import.meta.env.VITE_APPWRITE_DATABASE_ID?.trim() || "cpsm";
export const ADMIN_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_FUNCTION_ID?.trim() || "admin-users";

export const TABLE_PROFILES = "profiles";
export const TABLE_REPORTS = "reports";
export const TABLE_SETTINGS = "settings";
export const TABLE_SHIPMENTS = "shipments";

/** The settings table holds exactly one row, under a fixed id. */
export const SETTINGS_ROW_ID = "app";

const REMEMBER_KEY = "cpsm.auth.remember";
const TAB_KEY = "cpsm.auth.tab";
const SESSION_KEY = "cpsm.auth.session";
const SESSION_PROBED_KEY = "cpsm.auth.probed";

/**
 * Whether this browser is believed to hold an Appwrite session.
 *
 * Appwrite answers 401 for every account call made without one, and the browser
 * logs each of those as a failed request in the console — noise that looks like
 * a broken app on what is really just a signed-out visitor. The marker lets the
 * repository skip the calls it already knows cannot succeed: no session marker
 * means no `account.get()` on boot and no `deleteSession` on sign-out.
 *
 * It is a hint, never an authority. A marker can outlive the session it
 * describes (an expired or server-revoked session), in which case the first
 * account call 401s once and the marker is cleared — the same outcome as
 * before, just once instead of on every load.
 */
export function markSessionActive(): void {
  localStorage.setItem(SESSION_KEY, "1");
}

/**
 * Whether this browser has been checked once for a session predating the
 * marker.
 *
 * The marker is only written at sign-in, so a browser already holding a valid
 * session when this code first ships has none — and treating "no marker" as
 * "signed out" would sign every existing user out on deploy. The first load
 * therefore still asks Appwrite once and adopts whatever session it finds.
 * Sticky for the life of the browser profile, including across sign-out, so
 * that question is asked exactly once and never becomes recurring noise.
 */
export function hasProbedForSession(): boolean {
  return localStorage.getItem(SESSION_PROBED_KEY) === "1";
}

export function markSessionProbed(): void {
  localStorage.setItem(SESSION_PROBED_KEY, "1");
}

export function clearSessionMarker(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function hasSessionMarker(): boolean {
  return localStorage.getItem(SESSION_KEY) === "1";
}

/**
 * Appwrite sessions are long-lived and stored for us — there is no per-session
 * "expire when the browser closes" option. "Remember me" is emulated instead:
 * when the box is unticked we drop a marker in sessionStorage, which the
 * browser discards when the tab closes. A persisted session whose marker has
 * vanished belonged to a closed tab, so the repository signs it out on the next
 * startup rather than restoring it.
 */
export function setRememberSession(remember: boolean): void {
  localStorage.setItem(REMEMBER_KEY, String(remember));
  if (remember) sessionStorage.removeItem(TAB_KEY);
  else sessionStorage.setItem(TAB_KEY, "1");
}

/** True when the stored session was created by a tab that has since closed. */
export function sessionOutlivedItsTab(): boolean {
  return (
    localStorage.getItem(REMEMBER_KEY) === "false" &&
    sessionStorage.getItem(TAB_KEY) === null
  );
}

export function clearRememberSession(): void {
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(TAB_KEY);
  clearSessionMarker();
}

/** The shared client, or null when the app is running against localStorage. */
export const client: Client | null = isAppwriteConfigured
  ? new Client().setEndpoint(endpoint!).setProject(projectId!)
  : null;

export const account = client ? new Account(client) : null;
export const tablesDB = client ? new TablesDB(client) : null;
export const functions = client ? new Functions(client) : null;
