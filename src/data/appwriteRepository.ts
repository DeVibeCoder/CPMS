import {
  Account,
  AppwriteException,
  type Client,
  ExecutionMethod,
  Functions,
  ID,
  Query,
  TablesDB,
  type Models,
} from "appwrite";
import type {
  CompanySettings,
  Database,
  NewUser,
  Report,
  ReportData,
  ReportStatus,
  Role,
  User,
  UserPatch,
} from "@/types";
import type { Repository } from "./repository";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  ADMIN_FUNCTION_ID,
  DATABASE_ID,
  SETTINGS_ROW_ID,
  TABLE_PROFILES,
  TABLE_REPORTS,
  TABLE_SETTINGS,
  clearRememberSession,
  sessionOutlivedItsTab,
  setRememberSession,
} from "@/lib/appwrite";

// -----------------------------------------------------------------------------
// Row shapes.
//
// The profile table deliberately holds *no* privileged field. A role lives on
// the Appwrite account as a label and "active" is the account's own enabled
// flag, both of which only a server API key can change. A user may therefore
// edit their own profile row freely without being able to promote themselves —
// the table permissions below grant admin access via `label:admin`, never via
// anything stored here.
// -----------------------------------------------------------------------------
interface ProfileRow extends Models.Row {
  name: string;
  displayName: string | null;
  username: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  lastLogin: string | null;
}

interface ReportRow extends Models.Row {
  date: string;
  status: ReportStatus;
  /** ReportData as JSON — Appwrite columns are scalars, so it is stored as text. */
  data: string;
  createdBy: string | null;
  createdByName: string;
  updatedByName: string | null;
}

/**
 * The settings row.
 *
 * The branding columns (`companyName`, `reportTitle`, `pdfHeader`, `pdfFooter`,
 * `logoDataUrl`, `bagWeightMt`) still exist in the table but are no longer read
 * or written — those values are constants in `src/config/brand.ts` now. They are
 * left in place deliberately: dropping columns from a live plant database to
 * remove fields nothing reads would be risk without benefit.
 */
interface SettingsRow extends Models.Row {
  defaultTheme: CompanySettings["defaultTheme"];
  cementOpeningBalance: number | null;
  cementOpeningDate: string | null;
}

const ROLES: Role[] = ["admin", "dispatch", "viewer"];

/** Appwrite caps a page at 100 rows; anything longer is walked with a cursor. */
const PAGE_SIZE = 100;

/** Drop undefined so a partial patch never clears a column it didn't mention. */
function defined<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  );
}

/** The authoritative role is the account label, not anything in the database. */
function roleFromLabels(labels: string[]): Role {
  return ROLES.find((r) => labels.includes(r)) ?? "viewer";
}

function toUser(account: Models.User<Models.Preferences>, row: ProfileRow): User {
  return {
    id: account.$id,
    name: row.name,
    displayName: row.displayName ?? undefined,
    username: row.username ?? undefined,
    email: account.email,
    role: roleFromLabels(account.labels),
    active: account.status,
    createdAt: account.registration,
    lastLogin: row.lastLogin ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
  };
}

function toProfileRow(patch: Partial<User>): Record<string, unknown> {
  return defined({
    name: patch.name,
    displayName: patch.displayName,
    username: patch.username,
    avatarColor: patch.avatarColor,
    avatarUrl: patch.avatarUrl,
  });
}

function toReport(row: ReportRow): Report {
  let data: ReportData;
  try {
    data = JSON.parse(row.data) as ReportData;
  } catch {
    throw new Error(`Report ${row.date} holds data that could not be read.`);
  }
  return {
    id: row.$id,
    date: row.date,
    status: row.status,
    data,
    createdBy: row.createdBy ?? "",
    createdByName: row.createdByName,
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
    updatedByName: row.updatedByName ?? undefined,
  };
}

function toSettings(row: SettingsRow): CompanySettings {
  return {
    defaultTheme: row.defaultTheme,
    cementOpeningBalance:
      row.cementOpeningBalance === null
        ? undefined
        : Number(row.cementOpeningBalance),
    cementOpeningDate: row.cementOpeningDate ?? undefined,
  };
}

/** Turn an Appwrite error into something a plant operator can read. */
function fail(message: string, e: unknown, conflict?: string): never {
  if (e instanceof AppwriteException) {
    if (conflict && e.code === 409) throw new Error(conflict);
    if (e.code === 401 || e.code === 403) {
      throw new Error("You do not have permission to do that.");
    }
    // "Unknown attribute" means the database predates a column the app now
    // writes. That is a setup step, not a user error, so say which column and
    // what to run rather than surfacing Appwrite's wording.
    const missing = /Unknown attribute: "?([\w.]+)"?/.exec(e.message)?.[1];
    if (missing) {
      throw new Error(
        `The database is missing the "${missing}" column. Run "npm run appwrite:setup" (or add the column in the Appwrite console) and try again.`,
      );
    }
    throw new Error(`${message} ${e.message}`.trim());
  }
  if (e instanceof Error) throw new Error(`${message} ${e.message}`.trim());
  throw new Error(message);
}

/**
 * Appwrite-backed repository: Appwrite Auth for identity, TablesDB for data.
 *
 * Authorisation is enforced by Appwrite's own table permissions, not here — the
 * `can()` checks in the UI only decide what to *show*. Roles are account
 * labels, so `label:admin` / `label:dispatch` in the table permissions hold
 * even if someone bypasses the UI and calls the API directly.
 *
 * Anything needing an API key (creating or deleting accounts, changing a role,
 * enabling or disabling an account, resetting somebody else's password) goes
 * through the `admin-users` function.
 */
export class AppwriteRepository implements Repository {
  private readonly account: Account;
  private readonly tables: TablesDB;
  private readonly functions: Functions;

  constructor(client: Client) {
    this.account = new Account(client);
    this.tables = new TablesDB(client);
    this.functions = new Functions(client);
  }

  // ---- internals ----
  private async profileById(id: string): Promise<ProfileRow | null> {
    try {
      return (await this.tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_PROFILES,
        rowId: id,
      })) as unknown as ProfileRow;
    } catch (e) {
      if (e instanceof AppwriteException && e.code === 404) return null;
      return fail("Could not load your profile.", e);
    }
  }

  /** Walk every page of a table. Report counts stay small, but not forever. */
  private async listAllRows(
    tableId: string,
    queries: string[] = [],
  ): Promise<Models.DefaultRow[]> {
    const rows: Models.DefaultRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.tables.listRows({
        databaseId: DATABASE_ID,
        tableId,
        queries: [
          ...queries,
          Query.limit(PAGE_SIZE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      rows.push(...page.rows);
      if (page.rows.length < PAGE_SIZE) return rows;
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }

  /**
   * Call the privileged function.
   *
   * The caller proves who they are with a short-lived JWT rather than a header
   * the browser controls; the function re-checks on every call that the JWT
   * belongs to a signed-in administrator. Being able to reach the endpoint is
   * not by itself permission to use it.
   */
  private async invokeAdmin<T>(payload: Record<string, unknown>): Promise<T> {
    let jwt: string;
    try {
      jwt = (await this.account.createJWT()).jwt;
    } catch {
      throw new Error("You are not signed in.");
    }

    let execution: Models.Execution;
    try {
      execution = await this.functions.createExecution({
        functionId: ADMIN_FUNCTION_ID,
        body: JSON.stringify({ ...payload, jwt }),
        async: false,
        xpath: "/",
        method: ExecutionMethod.POST,
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `${detail} (Is the admin-users function deployed? See appwrite/README.md.)`,
      );
    }

    if (execution.status === "failed") {
      throw new Error(
        "The admin-users function crashed. Check its logs in the Appwrite console.",
      );
    }

    let body: { error?: string } & Record<string, unknown>;
    try {
      body = JSON.parse(execution.responseBody || "{}");
    } catch {
      throw new Error("The admin-users function returned an unreadable response.");
    }
    if (execution.responseStatusCode >= 400) {
      throw new Error(body.error ?? "The request was rejected.");
    }
    return body as T;
  }

  // ---- Session ----
  async login(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<User | null> {
    // Must happen before sign-in so the "remember" marker matches this session.
    setRememberSession(remember);

    // A leftover session makes Appwrite reject the new one outright.
    try {
      await this.account.deleteSession({ sessionId: "current" });
    } catch {
      /* there was nothing to clear */
    }

    try {
      await this.account.createEmailPasswordSession({
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (e) {
      if (e instanceof AppwriteException && e.type === "user_blocked") {
        throw new Error("This account has been disabled.");
      }
      return null;
    }

    const me = await this.account.get();
    const profile = await this.profileById(me.$id);
    if (!profile) {
      await this.logout();
      throw new Error(
        "Your account has no profile yet. Ask an administrator to set it up.",
      );
    }

    const lastLogin = new Date().toISOString();
    try {
      // Best effort — a failed timestamp write should never block a valid login.
      await this.tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_PROFILES,
        rowId: me.$id,
        data: { lastLogin },
      });
    } catch {
      /* ignore */
    }

    return toUser(me, { ...profile, lastLogin });
  }

  async getCurrentUser(): Promise<User | null> {
    // "Remember me" was unticked and the tab that signed in has since closed.
    if (sessionOutlivedItsTab()) {
      await this.logout();
      return null;
    }

    let me: Models.User<Models.Preferences>;
    try {
      me = await this.account.get();
    } catch {
      return null;
    }

    const profile = await this.profileById(me.$id);
    if (!profile) {
      await this.logout();
      return null;
    }
    return toUser(me, profile);
  }

  async logout(): Promise<void> {
    clearRememberSession();
    try {
      await this.account.deleteSession({ sessionId: "current" });
    } catch {
      /* already signed out */
    }
  }

  async changePassword(current: string, next: string): Promise<void> {
    try {
      await this.account.updatePassword({
        password: next,
        oldPassword: current,
      });
    } catch (e) {
      if (e instanceof AppwriteException && (e.code === 401 || e.code === 400)) {
        throw new Error("Current password is incorrect.");
      }
      fail("Could not change your password.", e);
    }
  }

  // ---- Users ----
  /**
   * Roles and enabled flags live on the accounts themselves, and only a server
   * API key may read the account list, so this goes through the function.
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

    // Editing your own display fields needs no elevated rights; everything else
    // — another person's row, a role, an enabled flag, a password — does.
    if (!privileged) {
      let me: Models.User<Models.Preferences> | null = null;
      try {
        me = await this.account.get();
      } catch {
        throw new Error("You are not signed in.");
      }
      if (me.$id === id) {
        const row = toProfileRow(patch);
        const profile =
          Object.keys(row).length === 0
            ? await this.profileById(id)
            : await this.tables
                .updateRow({
                  databaseId: DATABASE_ID,
                  tableId: TABLE_PROFILES,
                  rowId: id,
                  data: row,
                })
                .then((r) => r as unknown as ProfileRow)
                .catch((e) => fail("Could not update your profile.", e));
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
    try {
      const rows = await this.listAllRows(TABLE_REPORTS, [
        Query.orderDesc("date"),
      ]);
      return rows.map((r) => toReport(r as unknown as ReportRow));
    } catch (e) {
      return fail("Could not load reports.", e);
    }
  }

  async getReport(id: string): Promise<Report | null> {
    try {
      const row = (await this.tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_REPORTS,
        rowId: id,
      })) as unknown as ReportRow;
      return toReport(row);
    } catch (e) {
      if (e instanceof AppwriteException && e.code === 404) return null;
      return fail("Could not load the report.", e);
    }
  }

  async getReportByDate(date: string): Promise<Report | null> {
    try {
      const page = await this.tables.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLE_REPORTS,
        queries: [Query.equal("date", date), Query.limit(1)],
      });
      const row = page.rows[0];
      return row ? toReport(row as unknown as ReportRow) : null;
    } catch (e) {
      return fail("Could not load the report.", e);
    }
  }

  async createReport(
    input: Omit<Report, "id" | "createdAt" | "updatedAt">,
  ): Promise<Report> {
    try {
      const row = (await this.tables.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_REPORTS,
        rowId: ID.unique(),
        data: {
          date: input.date,
          status: input.status,
          data: JSON.stringify(input.data),
          createdBy: input.createdBy || null,
          createdByName: input.createdByName,
          updatedByName: input.updatedByName ?? input.createdByName,
        },
      })) as unknown as ReportRow;
      return toReport(row);
    } catch (e) {
      return fail(
        "Could not save the report.",
        e,
        "A report already exists for that date.",
      );
    }
  }

  async updateReport(id: string, patch: Partial<Report>): Promise<Report> {
    const data = defined({
      date: patch.date,
      status: patch.status,
      data: patch.data === undefined ? undefined : JSON.stringify(patch.data),
      createdByName: patch.createdByName,
      updatedByName: patch.updatedByName,
    });
    try {
      const row = (await this.tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_REPORTS,
        rowId: id,
        data,
      })) as unknown as ReportRow;
      return toReport(row);
    } catch (e) {
      return fail(
        "Could not update the report.",
        e,
        "A report already exists for that date.",
      );
    }
  }

  async deleteReport(id: string): Promise<void> {
    try {
      await this.tables.deleteRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_REPORTS,
        rowId: id,
      });
    } catch (e) {
      fail("Could not delete the report.", e);
    }
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

  // ---- Settings ----
  async getSettings(): Promise<CompanySettings> {
    try {
      const row = (await this.tables.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_SETTINGS,
        rowId: SETTINGS_ROW_ID,
      })) as unknown as SettingsRow;
      return toSettings(row);
    } catch (e) {
      if (e instanceof AppwriteException && e.code === 404) {
        return { ...DEFAULT_SETTINGS };
      }
      return fail("Could not load settings.", e);
    }
  }

  async updateSettings(
    patch: Partial<CompanySettings>,
  ): Promise<CompanySettings> {
    const data = defined(patch);
    if (Object.keys(data).length === 0) return this.getSettings();

    try {
      const row = (await this.tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_SETTINGS,
        rowId: SETTINGS_ROW_ID,
        data,
      })) as unknown as SettingsRow;
      return toSettings(row);
    } catch (e) {
      return fail("Could not save settings.", e);
    }
  }

  // ---- Backup / Restore ----
  async exportDatabase(): Promise<Database> {
    const [users, reports, settings] = await Promise.all([
      this.listUsers(),
      this.listReports(),
      this.getSettings(),
    ]);
    return { version: 2, users, reports, settings };
  }

  /**
   * Restore reports and settings from a backup file.
   *
   * Users are deliberately *not* restored: accounts live in Appwrite Auth and a
   * backup contains no credentials, so recreating them here would produce
   * profiles nobody can sign in to. Reports are matched on date, so restoring
   * over a live database updates same-day rows rather than duplicating them.
   */
  async importDatabase(db: Database): Promise<void> {
    if (db.settings) await this.updateSettings(db.settings);
    if (!Array.isArray(db.reports) || db.reports.length === 0) return;

    const existing = new Map(
      (await this.listAllRows(TABLE_REPORTS)).map((r) => [
        (r as unknown as ReportRow).date,
        r.$id,
      ]),
    );

    for (const report of db.reports) {
      // Author ids from a backup belong to a different identity store, so only
      // the recorded name is carried over.
      const data = {
        date: report.date,
        status: report.status,
        data: JSON.stringify(report.data),
        createdBy: null,
        createdByName: report.createdByName,
        updatedByName: report.updatedByName ?? report.createdByName,
      };
      try {
        await this.tables.upsertRow({
          databaseId: DATABASE_ID,
          tableId: TABLE_REPORTS,
          rowId: existing.get(report.date) ?? ID.unique(),
          data,
        });
      } catch (e) {
        fail("Could not restore the backup.", e);
      }
    }
  }

  /** Deletes every report and restores default settings. Admin only. */
  async resetDatabase(): Promise<void> {
    try {
      const rows = await this.listAllRows(TABLE_REPORTS);
      for (const row of rows) {
        await this.tables.deleteRow({
          databaseId: DATABASE_ID,
          tableId: TABLE_REPORTS,
          rowId: row.$id,
        });
      }
    } catch (e) {
      fail("Could not clear reports.", e);
    }
    await this.updateSettings({ ...DEFAULT_SETTINGS });
  }
}
