import type {
  CompanySettings,
  Database,
  Report,
  User,
} from "@/types";
import type { Repository } from "./repository";
import { seedDatabase } from "./seed";
import { uid } from "@/lib/utils";

const STORAGE_KEY = "cpsr.db.v2";
/** Simulated network latency so the UI's loading states are exercised. */
const LATENCY = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

/**
 * JSON database backed by localStorage. Acts like a tiny async ORM. The entire
 * DB is a single JSON document — trivial to serialise, back up, and later
 * migrate into a relational schema.
 */
export class LocalRepository implements Repository {
  private read(): Database {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Database;
    } catch {
      /* fall through to seed */
    }
    const seeded = seedDatabase();
    this.write(seeded);
    return seeded;
  }

  private write(db: Database): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  private mutate<T>(fn: (db: Database) => T): T {
    const db = this.read();
    const result = fn(db);
    this.write(db);
    return result;
  }

  // ---- Auth / Users ----
  async login(email: string, password: string): Promise<User | null> {
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
    return delay({ ...user });
  }

  async listUsers(): Promise<User[]> {
    return delay(this.read().users.map((u) => ({ ...u })));
  }

  async createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
    return delay(
      this.mutate((db) => {
        if (
          db.users.some(
            (u) => u.email.toLowerCase() === input.email.toLowerCase(),
          )
        ) {
          throw new Error("A user with this email already exists.");
        }
        const user: User = {
          ...input,
          id: uid("u-"),
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        return { ...user };
      }),
    );
  }

  async updateUser(id: string, patch: Partial<User>): Promise<User> {
    return delay(
      this.mutate((db) => {
        const u = db.users.find((x) => x.id === id);
        if (!u) throw new Error("User not found.");
        Object.assign(u, patch);
        return { ...u };
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
    return delay(structuredClone(this.read()));
  }

  async importDatabase(db: Database): Promise<void> {
    this.write(structuredClone(db));
    return delay(undefined);
  }

  async resetDatabase(): Promise<void> {
    this.write(seedDatabase());
    return delay(undefined);
  }
}
