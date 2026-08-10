import type {
  AuthError,
  PostgrestError,
  SupabaseClient,
  User as AuthUser,
} from "@supabase/supabase-js";

import type {
  CompanySettings,
  Database,
  NewShipment,
  NewUser,
  Report,
  ReportData,
  ReportStatus,
  Role,
  Shipment,
  User,
  UserPatch,
} from "@/types";
import type { Repository } from "./repository";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  ADMIN_ENDPOINT,
  SETTINGS_ROW_ID,
  TABLE_PROFILES,
  TABLE_REPORTS,
  TABLE_SETTINGS,
  TABLE_SHIPMENTS,
  clearRememberSession,
  setRememberSession,
} from "@/lib/supabase";

// -----------------------------------------------------------------------------
// Row shapes.
//
// Columns are snake_case; the domain types are camelCase. The mapping lives in
// this file and nowhere else, which is what lets src/types stay unchanged.
//
// As in the Appwrite schema, the profile row holds no privileged field. The role
// lives in the account's app_metadata and "active" is the account's own banned
// state, neither of which a client can write — so a user may edit their own
// profile row freely without being able to promote themselves.
// -----------------------------------------------------------------------------
interface ProfileRow {
  id: string;
  name: string;
  display_name: string | null;
  username: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportRow {
  id: string;
  date: string;
  status: ReportStatus;
  /** Real jsonb, so it arrives parsed rather than as a string to JSON.parse. */
  data: ReportData;
  created_by: string | null;
  created_by_name: string;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ShipmentRow {
  id: string;
  date: string;
  amount_mt: number;
  note: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface SettingsRow {
  id: string;
  default_theme: CompanySettings["defaultTheme"];
  cement_opening_balance: number | null;
  cement_opening_date: string | null;
}

const ROLES: Role[] = ["admin", "dispatch", "viewer"];

/** Drop undefined so a partial patch never clears a column it didn't mention. */
function defined<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}

/** The authoritative role is the account claim, not anything in the database. */
function roleFromAccount(account: AuthUser): Role {
  const claim = account.app_metadata?.role as string | undefined;
  return ROLES.find((r) => r === claim) ?? "viewer";
}

function toUser(account: AuthUser, row: ProfileRow): User {
  return {
    id: account.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    username: row.username ?? undefined,
    email: account.email ?? "",
    role: roleFromAccount(account),
    // Reaching this code at all means the account signed in, which a banned
    // account cannot do. The admin route reports the real flag for everyone else.
    active: true,
    createdAt: account.created_at,
    lastLogin: row.last_login ?? undefined,
    avatarColor: row.avatar_color ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
  };
}

/** Only the columns a profile row stores, with undefined dropped. */
function toProfileRow(patch: Partial<User>): Record<string, unknown> {
  return defined({
    name: patch.name,
    display_name: patch.displayName,
    username: patch.username,
    avatar_color: patch.avatarColor,
    avatar_url: patch.avatarUrl,
  });
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    data: row.data,
    createdBy: row.created_by ?? "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name ?? undefined,
  };
}

function toShipment(row: ShipmentRow): Shipment {
  return {
    id: row.id,
    date: row.date,
    amountMt: Number(row.amount_mt) || 0,
    note: row.note ?? undefined,
    createdBy: row.created_by ?? "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSettings(row: SettingsRow): CompanySettings {
  return {
    defaultTheme: row.default_theme,
    cementOpeningBalance:
      row.cement_opening_balance === null
        ? undefined
        : Number(row.cement_opening_balance),
    cementOpeningDate: row.cement_opening_date ?? undefined,
  };
}

function toSettingsRow(patch: Partial<CompanySettings>): Record<string, unknown> {
  return defined({
    default_theme: patch.defaultTheme,
    cement_opening_balance: patch.cementOpeningBalance,
    cement_opening_date: patch.cementOpeningDate,
  });
}

/** Turn a Postgres error into something a plant operator can read. */
function fail(message: string, e: PostgrestError | null, conflict?: string): never {
  if (!e) throw new Error(message);

  // 23505 — unique violation. The only unique columns are reports.date and
  // shipments.date, so this always means "that day already has one".
  if (conflict && e.code === "23505") throw new Error(conflict);

  // 42501 — insufficient privilege, i.e. a policy or grant said no.
  if (e.code === "42501") {
    throw new Error("You do not have permission to do that.");
  }

  // 42P01 — the table does not exist, so the migrations have not been applied.
  // That is a setup step, not a user error: say which command fixes it.
  if (e.code === "42P01") {
    throw new Error(
      'The database is missing a table. Run "npm run db:migrate" and try again.',
    );
  }

  // 42703 — undefined column, i.e. the schema predates something the app writes.
  if (e.code === "42703") {
    throw new Error(
      `The database is missing a column (${e.message}). Run "npm run db:migrate" and try again.`,
    );
  }

  throw new Error(`${message} ${e.message}`.trim());
}

/**
 * The failures that genuinely mean "wrong email or password".
 *
 * Everything else that can make sign-in fail — a paused project, a 5xx, an
 * outage — must never be reported as bad credentials. Blaming the password for
 * a backend outage sends someone hunting for a typo that does not exist, which
 * is the exact wrong place to look.
 */
const CREDENTIAL_FAILURES = new Set([
  "invalid_credentials",
  "invalid_login_credentials",
  "user_not_found",
]);

/** Turn a non-credential auth failure into something worth reading. */
function authFailureMessage(e: AuthError): string {
  if (!e.status || e.status >= 500) {
    return (
      "The backend is not responding. The Supabase project may be paused — " +
      "ask an administrator to check the Supabase dashboard."
    );
  }
  return `Sign-in failed: ${e.message}`;
}

/**
 * Supabase-backed repository: Supabase Auth for identity, Postgres for data.
 *
 * Authorisation is enforced by row-level security, not here — the `can()` checks
 * in the UI only decide what to *show*. The role is a JWT claim written from
 * app_metadata, so the policies hold even if someone bypasses the UI and calls
 * PostgREST directly.
 *
 * Anything needing the service key (creating or deleting accounts, changing a
 * role, enabling or disabling an account, resetting somebody else's password)
 * goes through the api/admin-users route.
 */
export class SupabaseRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  // ---- internals ----
  private async profileById(id: string): Promise<ProfileRow | null> {
    const { data, error } = await this.db
      .from(TABLE_PROFILES)
      .select("*")
      .eq("id", id)
      .maybeSingle<ProfileRow>();
    if (error) return fail("Could not load your profile.", error);
    return data;
  }

  private async currentAccount(): Promise<AuthUser | null> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user ?? null;
  }

  /**
   * Call the privileged route.
   *
   * The caller proves who they are with its access token; the route re-checks on
   * every call that the token belongs to a signed-in administrator. Being able
   * to reach the endpoint is not by itself permission to use it.
   */
  private async invokeAdmin<T>(payload: Record<string, unknown>): Promise<T> {
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("You are not signed in.");

    let res: Response;
    try {
      res = await fetch(ADMIN_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not reach user management. ${detail}`.trim());
    }

    let body: { error?: string } & Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      throw new Error(
        res.ok
          ? "User management returned an unreadable response."
          : `User management failed (HTTP ${res.status}).`,
      );
    }
    if (!res.ok) throw new Error(body.error ?? "The request was rejected.");
    return body as T;
  }

  // ---- Session ----
  async login(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<User | null> {
    // Must happen before sign-in: the storage adapter reads this on every write,
    // so setting it afterwards would put the first session in the wrong store.
    setRememberSession(remember);

    const { data, error } = await this.db.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      clearRememberSession();
      // Older releases of supabase-js report the reason only in the message, so
      // neither signal is trusted alone.
      const code = error.code ?? "";
      const text = error.message.toLowerCase();
      if (code === "user_banned" || text.includes("banned")) {
        throw new Error("This account has been disabled.");
      }
      if (
        CREDENTIAL_FAILURES.has(code) ||
        text.includes("invalid login credentials")
      ) {
        return null;
      }
      // A fetch that never reached Supabase carries no status at all — DNS, CORS
      // or an offline browser. A paused project can fail this way too.
      throw new Error(authFailureMessage(error));
    }

    const account = data.user;
    if (!account) return null;

    const profile = await this.profileById(account.id);
    if (!profile) {
      await this.logout();
      throw new Error(
        "Your account has no profile yet. Ask an administrator to set it up.",
      );
    }

    const lastLogin = new Date().toISOString();
    // Best effort — a failed timestamp write should never block a valid login.
    await this.db
      .from(TABLE_PROFILES)
      .update({ last_login: lastLogin })
      .eq("id", account.id);

    return toUser(account, { ...profile, last_login: lastLogin });
  }

  /**
   * Restore the signed-in user, if any.
   *
   * `getSession` reads the persisted session and refreshes it when needed, so
   * unlike Appwrite there is nothing to probe for and no 401 to avoid: a browser
   * that was never signed in simply has no stored session and this returns null
   * without a request.
   */
  async getCurrentUser(): Promise<User | null> {
    const account = await this.currentAccount();
    if (!account) return null;

    const profile = await this.profileById(account.id);
    if (!profile) {
      await this.logout();
      return null;
    }
    return toUser(account, profile);
  }

  async logout(): Promise<void> {
    clearRememberSession();
    await this.db.auth.signOut();
  }

  /**
   * Change the signed-in user's own password.
   *
   * `updateUser` does not check the current password, but the interface promises
   * to throw when it is wrong — so verify it by signing in with it first. The
   * sign-in is for the same account that is already signed in, so it replaces
   * the session with an equivalent one and nothing else changes.
   */
  async changePassword(current: string, next: string): Promise<void> {
    const account = await this.currentAccount();
    if (!account?.email) throw new Error("You are not signed in.");

    const { error: wrong } = await this.db.auth.signInWithPassword({
      email: account.email,
      password: current,
    });
    if (wrong) throw new Error("Current password is incorrect.");

    const { error } = await this.db.auth.updateUser({ password: next });
    if (error) throw new Error(`Could not change your password. ${error.message}`);
  }

  // ---- Users ----
  /**
   * Roles and enabled flags live on the accounts themselves, and only the
   * service key may read the account list, so this goes through the route.
   */
  async listUsers(): Promise<User[]> {
    const { users } = await this.invokeAdmin<{ users: User[] }>({
      action: "list",
    });
    return users;
  }

  async createUser(input: NewUser): Promise<User> {
    const { user } = await this.invokeAdmin<{ user: User }>({
      action: "create",
      email: input.email.trim().toLowerCase(),
      password: input.password,
      name: input.name,
      displayName: input.displayName,
      username: input.username,
      role: input.role,
      active: input.active,
      avatarColor: input.avatarColor,
      avatarUrl: input.avatarUrl,
    });
    return user;
  }

  async updateUser(id: string, patch: UserPatch): Promise<User> {
    const privileged =
      patch.role !== undefined || patch.active !== undefined || !!patch.password;

    // Editing your own display fields needs no elevated rights — the profiles
    // policy already allows it. Everything else — another person's row, a role,
    // an enabled flag, a password — goes through the route.
    if (!privileged) {
      const me = await this.currentAccount();
      if (!me) throw new Error("You are not signed in.");
      if (me.id === id) {
        const row = toProfileRow(patch);
        let profile: ProfileRow | null;
        if (Object.keys(row).length === 0) {
          profile = await this.profileById(id);
        } else {
          const { data, error } = await this.db
            .from(TABLE_PROFILES)
            .update(row)
            .eq("id", id)
            .select()
            .maybeSingle<ProfileRow>();
          if (error) return fail("Could not update your profile.", error);
          profile = data;
        }
        if (!profile) throw new Error("User not found.");
        return toUser(me, profile);
      }
    }

    const { user } = await this.invokeAdmin<{ user: User }>({
      action: "update",
      id,
      name: patch.name,
      displayName: patch.displayName,
      username: patch.username,
      avatarColor: patch.avatarColor,
      avatarUrl: patch.avatarUrl,
      role: patch.role,
      active: patch.active,
      password: patch.password || undefined,
    });
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.invokeAdmin({ action: "delete", id });
  }

  // ---- Reports ----
  async listReports(): Promise<Report[]> {
    const { data, error } = await this.db
      .from(TABLE_REPORTS)
      .select("*")
      .order("date", { ascending: false })
      .returns<ReportRow[]>();
    if (error) return fail("Could not load reports.", error);
    return data.map(toReport);
  }

  async getReport(id: string): Promise<Report | null> {
    const { data, error } = await this.db
      .from(TABLE_REPORTS)
      .select("*")
      .eq("id", id)
      .maybeSingle<ReportRow>();
    if (error) return fail("Could not load the report.", error);
    return data ? toReport(data) : null;
  }

  async getReportByDate(date: string): Promise<Report | null> {
    const { data, error } = await this.db
      .from(TABLE_REPORTS)
      .select("*")
      .eq("date", date)
      .maybeSingle<ReportRow>();
    if (error) return fail("Could not load the report.", error);
    return data ? toReport(data) : null;
  }

  async createReport(
    input: Omit<Report, "id" | "createdAt" | "updatedAt">,
  ): Promise<Report> {
    const { data, error } = await this.db
      .from(TABLE_REPORTS)
      .insert({
        date: input.date,
        status: input.status,
        data: input.data,
        created_by: input.createdBy || null,
        created_by_name: input.createdByName,
        updated_by_name: input.updatedByName ?? input.createdByName,
      })
      .select()
      .single<ReportRow>();
    if (error) {
      return fail(
        "Could not save the report.",
        error,
        "A report already exists for that date.",
      );
    }
    return toReport(data);
  }

  async updateReport(id: string, patch: Partial<Report>): Promise<Report> {
    const row = defined({
      date: patch.date,
      status: patch.status,
      data: patch.data,
      created_by_name: patch.createdByName,
      updated_by_name: patch.updatedByName,
    });
    const { data, error } = await this.db
      .from(TABLE_REPORTS)
      .update(row)
      .eq("id", id)
      .select()
      .single<ReportRow>();
    if (error) {
      return fail(
        "Could not update the report.",
        error,
        "A report already exists for that date.",
      );
    }
    return toReport(data);
  }

  async deleteReport(id: string): Promise<void> {
    const { error } = await this.db.from(TABLE_REPORTS).delete().eq("id", id);
    if (error) fail("Could not delete the report.", error);
  }

  async duplicateReport(
    id: string,
    newDate: string,
    author: User,
  ): Promise<Report> {
    const source = await this.getReport(id);
    if (!source) throw new Error("Report not found.");
    return this.createReport({
      date: newDate,
      status: "draft",
      data: source.data,
      createdBy: author.id,
      createdByName: author.name,
      updatedByName: author.name,
    });
  }

  // ---- Shipments ----
  async listShipments(): Promise<Shipment[]> {
    const { data, error } = await this.db
      .from(TABLE_SHIPMENTS)
      .select("*")
      .order("date", { ascending: false })
      .returns<ShipmentRow[]>();
    if (error) return fail("Could not load shipments.", error);
    return data.map(toShipment);
  }

  /**
   * Log a shipment, replacing any existing one for the same date.
   *
   * An upsert on the date rather than an insert that might fail: the caller's
   * intent is "this is what arrived that day", so a second entry corrects the
   * first instead of being rejected. The unique constraint on `date` is what
   * makes the conflict target valid.
   */
  async saveShipment(input: NewShipment): Promise<Shipment> {
    const { data, error } = await this.db
      .from(TABLE_SHIPMENTS)
      .upsert(
        {
          date: input.date,
          amount_mt: input.amountMt,
          note: input.note || null,
          created_by: input.createdBy || null,
          created_by_name: input.createdByName,
        },
        { onConflict: "date" },
      )
      .select()
      .single<ShipmentRow>();
    if (error) return fail("Could not save the shipment.", error);
    return toShipment(data);
  }

  async deleteShipment(id: string): Promise<void> {
    const { error } = await this.db.from(TABLE_SHIPMENTS).delete().eq("id", id);
    if (error) fail("Could not delete the shipment.", error);
  }

  // ---- Settings ----
  async getSettings(): Promise<CompanySettings> {
    const { data, error } = await this.db
      .from(TABLE_SETTINGS)
      .select("*")
      .eq("id", SETTINGS_ROW_ID)
      .maybeSingle<SettingsRow>();
    if (error) return fail("Could not load settings.", error);
    return data ? toSettings(data) : { ...DEFAULT_SETTINGS };
  }

  async updateSettings(
    patch: Partial<CompanySettings>,
  ): Promise<CompanySettings> {
    const row = toSettingsRow(patch);
    if (Object.keys(row).length === 0) return this.getSettings();

    const { data, error } = await this.db
      .from(TABLE_SETTINGS)
      .update(row)
      .eq("id", SETTINGS_ROW_ID)
      .select()
      .single<SettingsRow>();
    if (error) return fail("Could not save settings.", error);
    return toSettings(data);
  }

  // ---- Backup / Restore ----
  async exportDatabase(): Promise<Database> {
    const [users, reports, shipments, settings] = await Promise.all([
      this.listUsers(),
      this.listReports(),
      this.listShipments(),
      this.getSettings(),
    ]);
    return { version: 3, users, reports, shipments, settings };
  }

  /**
   * Restore reports and settings from a backup file.
   *
   * Users are deliberately *not* restored: accounts live in Supabase Auth and a
   * backup contains no credentials, so recreating them here would produce
   * profiles nobody can sign in to. Reports are matched on date, so restoring
   * over a live database updates same-day rows rather than duplicating them.
   */
  async importDatabase(db: Database): Promise<void> {
    if (db.settings) await this.updateSettings(db.settings);
    await this.importShipments(db.shipments);
    if (!Array.isArray(db.reports) || db.reports.length === 0) return;

    // No id in the payload: on insert the default generates one, and on conflict
    // the existing row keeps the id it already has.
    const rows = db.reports.map((report) => ({
      date: report.date,
      status: report.status,
      data: report.data,
      // Author ids from a backup belong to a different identity store, so only
      // the recorded name is carried over.
      created_by: null,
      created_by_name: report.createdByName,
      updated_by_name: report.updatedByName ?? report.createdByName,
    }));

    const { error } = await this.db
      .from(TABLE_REPORTS)
      .upsert(rows, { onConflict: "date" });
    if (error) fail("Could not restore the backup.", error);
  }

  /** Restore the shipments ledger from a backup, matching on date. */
  private async importShipments(shipments?: Shipment[]): Promise<void> {
    if (!Array.isArray(shipments) || shipments.length === 0) return;

    const rows = shipments.map((shipment) => ({
      date: shipment.date,
      amount_mt: shipment.amountMt,
      note: shipment.note ?? null,
      created_by: null,
      created_by_name: shipment.createdByName,
    }));

    const { error } = await this.db
      .from(TABLE_SHIPMENTS)
      .upsert(rows, { onConflict: "date" });
    if (error) fail("Could not restore the shipments.", error);
  }

  /** Deletes every report and shipment and restores default settings. Admin only. */
  async resetDatabase(): Promise<void> {
    // PostgREST refuses an unfiltered delete, which is a guard worth having.
    // Every row has a date, so this matches all of them and nothing else.
    const { error: reports } = await this.db
      .from(TABLE_REPORTS)
      .delete()
      .not("date", "is", null);
    if (reports) fail("Could not clear reports.", reports);

    const { error: shipments } = await this.db
      .from(TABLE_SHIPMENTS)
      .delete()
      .not("date", "is", null);
    if (shipments) fail("Could not clear shipments.", shipments);

    // Matches the Appwrite behaviour exactly, including what it leaves alone:
    // DEFAULT_SETTINGS carries only the theme, and undefined fields are dropped,
    // so the cement opening balance survives a reset. Changing that here would
    // be a silent behaviour change smuggled in with a backend swap.
    await this.updateSettings({ ...DEFAULT_SETTINGS });
  }
}
