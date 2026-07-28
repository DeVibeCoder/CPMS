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

/** The settings table holds exactly one row, under a fixed id. */
export const SETTINGS_ROW_ID = "app";

const REMEMBER_KEY = "cpsm.auth.remember";
const TAB_KEY = "cpsm.auth.tab";

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
}

/** The shared client, or null when the app is running against localStorage. */
export const client: Client | null = isAppwriteConfigured
  ? new Client().setEndpoint(endpoint!).setProject(projectId!)
  : null;

export const account = client ? new Account(client) : null;
export const tablesDB = client ? new TablesDB(client) : null;
export const functions = client ? new Functions(client) : null;
