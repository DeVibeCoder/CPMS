import type {
  CompanySettings,
  Database,
  NewUser,
  Report,
  User,
  UserPatch,
} from "@/types";
import type { LocalDatabase, StoredUser } from "./localTypes";
import type { Repository } from "./repository";
import { seedDatabase } from "./seed";
import { uid } from "@/lib/utils";

const STORAGE_KEY = "cpsr.db.v2";
const SESSION_KEY = "cpsr.session";
/** Simulated network latency so the UI's loading states are exercised. */
const LATENCY = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

/** Drop the internal password field before a record leaves the repository. */
function publicUser(u: StoredUser): User {
  const { password: _password, ...rest } = u;
  return { ...rest };
}

/**
 * JSON database backed by localStorage. Acts like a tiny async ORM. The entire
 * DB is a single JSON document — trivial to serialise, back up, and later
 * migrate into a relational schema.
 *
 * This is the offline / demo fallback; passwords are stored in plain text and
 * there is no authorisation beyond what the UI chooses to hide. Anything
 * real runs on `AppwriteRepository`.
 */
export class LocalRepository implements Repository {
  private read(): LocalDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return this.migrate(JSON.parse(raw) as LocalDatabase);
    } catch {
      /* fall through to seed */
    }
    const seeded = seedDatabase();
    this.write(seeded);
    return seeded;
  }

  /** Bring a stored database up to date with the current schema. */
  private migrate(db: LocalDatabase): LocalDatabase {
    let changed = false;
    for (const u of db.users) {
      // The legacy "editor" role was renamed to "dispatch".
      if ((u.role as string) === "editor") {
        u.role = "dispatch";
        changed = true;
      }
    }
    if (changed) this.write(db);
    return db;
  }

  private write(db: LocalDatabase): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  private mutate<T>(fn: (db: LocalDatabase) => T): T {
    const db = this.read();
    const result = fn(db);
    this.write(db);
    return result;
  }

  // ---- Session ----
  async login(
    email: string,
    password: string,
    remember: boolean,
  ): Promise<User | null> {
    const db = this.read();
    const user = db.users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase().trim() &&
        u.password === password &&
        u.active,
    );
    if (!user) return delay(null);
    user.lastLogin = new Date().toISOString();
    this.write(db);

    const store = remember ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, remember }));
    // Clear the other store to avoid a stale session shadowing this one.
    (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);

    return delay(publicUser(user));
  }

  async getCurrentUser(): Promise<User | null> {
    const raw =
      localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const { userId } = JSON.parse(raw) as { userId: string };
      const user = this.read().users.find((u) => u.id === userId && u.active);
      if (!user) {
        await this.logout();
        return null;
      }
      return publicUser(user);
    } catch {
      await this.logout();
      return null;
    }
  }

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  async changePassword(current: string, next: string): Promise<void> {
    const me = await this.getCurrentUser();
    if (!me) throw new Error("You are not signed in.");
    return delay(
      this.mutate((db) => {
        const u = db.users.find((x) => x.id === me.id);
        if (!u) throw new Error("User not found.");
        if (u.password !== current) {
          throw new Error("Current password is incorrect.");
        }
        u.password = next;
      }),
    );
  }

  // ---- Users ----
  async listUsers(): Promise<User[]> {
    return delay(this.read().users.map(publicUser));
  }

  async createUser(input: NewUser): Promise<User> {
    return delay(
      this.mutate((db) => {
        if (
          db.users.some(
            (u) => u.email.toLowerCase() === input.email.toLowerCase(),
          )
        ) {
          throw new Error("A user with this email already exists.");
        }
        const user: StoredUser = {
          ...input,
          id: uid("u-"),
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        return publicUser(user);
      }),
    );
  }

  async updateUser(id: string, patch: UserPatch): Promise<User> {
    return delay(
      this.mutate((db) => {
        const u = db.users.find((x) => x.id === id);
        if (!u) throw new Error("User not found.");
        // An empty password means "leave it alone".
        const { password, ...rest } = patch;
        Object.assign(u, rest);
        if (password) u.password = password;
        return publicUser(u);
      }),
    );
  }

  async deleteUser(id: string): Promise<void> {
    return delay(
      this.mutate((db) => {
        db.users = db.users.filter((u) => u.id !== id);
      }),
    );
  }

  // ---- Reports ----
  async listReports(): Promise<Report[]> {
    const reports = this.read().reports.slice();
    reports.sort((a, b) => b.date.localeCompare(a.date));
    return delay(reports.map((r) => structuredClone(r)));
  }

  async getReport(id: string): Promise<Report | null> {
    const r = this.read().reports.find((x) => x.id === id);
    return delay(r ? structuredClone(r) : null);
  }

  async getReportByDate(date: string): Promise<Report | null> {
    const r = this.read().reports.find((x) => x.date === date);
    return delay(r ? structuredClone(r) : null);
  }

  async createReport(
    input: Omit<Report, "id" | "createdAt" | "updatedAt">,
  ): Promise<Report> {
    return delay(
      this.mutate((db) => {
        const now = new Date().toISOString();
        const report: Report = {
          ...structuredClone(input),
          id: uid("r-"),
          createdAt: now,
          updatedAt: now,
        };
        db.reports.push(report);
        return structuredClone(report);
      }),
    );
  }

  async updateReport(id: string, patch: Partial<Report>): Promise<Report> {
    return delay(
      this.mutate((db) => {
        const r = db.reports.find((x) => x.id === id);
        if (!r) throw new Error("Report not found.");
        Object.assign(r, structuredClone(patch), {
          updatedAt: new Date().toISOString(),
        });
        return structuredClone(r);
      }),
    );
  }

  async deleteReport(id: string): Promise<void> {
    return delay(
      this.mutate((db) => {
        db.reports = db.reports.filter((r) => r.id !== id);
      }),
    );
  }

  async duplicateReport(
    id: string,
    newDate: string,
    author: User,
  ): Promise<Report> {
    return delay(
      this.mutate((db) => {
        const src = db.reports.find((x) => x.id === id);
        if (!src) throw new Error("Report not found.");
        const now = new Date().toISOString();
        const copy: Report = {
          ...structuredClone(src),
          id: uid("r-"),
          date: newDate,
          status: "draft",
          createdBy: author.id,
          createdByName: author.name,
          createdAt: now,
          updatedAt: now,
          updatedByName: author.name,
        };
        db.reports.push(copy);
        return structuredClone(copy);
      }),
    );
  }

  // ---- Settings ----
  async getSettings(): Promise<CompanySettings> {
    return delay({ ...this.read().settings });
  }

  async updateSettings(
    patch: Partial<CompanySettings>,
  ): Promise<CompanySettings> {
    return delay(
      this.mutate((db) => {
        Object.assign(db.settings, patch);
        return { ...db.settings };
      }),
    );
  }

  // ---- Backup / Restore ----
  async exportDatabase(): Promise<Database> {
    const db = this.read();
    return delay({
      version: db.version,
      users: db.users.map(publicUser),
      reports: structuredClone(db.reports),
      settings: { ...db.settings },
    });
  }

  async importDatabase(db: Database): Promise<void> {
    // Backups carry no passwords. Keep the password of any user we already
    // know, and fall back to the email local-part for genuinely new ones so
    // the offline store stays usable after a restore.
    const existing = new Map(this.read().users.map((u) => [u.id, u.password]));
    const restored: LocalDatabase = {
      version: db.version,
      reports: structuredClone(db.reports),
      settings: { ...db.settings },
      users: db.users.map((u) => ({
        ...u,
        password: existing.get(u.id) ?? u.email.split("@")[0],
      })),
    };
    this.write(restored);
    return delay(undefined);
  }

  async resetDatabase(): Promise<void> {
    this.write(seedDatabase());
    return delay(undefined);
  }
}
