import type {
  CompanySettings,
  Database,
  Report,
  User,
} from "@/types";

/**
 * Repository contract.
 *
 * The whole app talks to data *only* through this async interface. The current
 * implementation is a JSON store persisted to localStorage, but any backend
 * (Supabase, a REST API, Postgres, etc.) can be dropped in by implementing
 * `Repository` and swapping the export in `src/data/index.ts`. No page or
 * component needs to change — every method is already async.
 */
export interface Repository {
  // ---- Auth / Users ----
  login(email: string, password: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(input: Omit<User, "id" | "createdAt">): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // ---- Reports ----
  listReports(): Promise<Report[]>;
  getReport(id: string): Promise<Report | null>;
  getReportByDate(date: string): Promise<Report | null>;
  createReport(
    input: Omit<Report, "id" | "createdAt" | "updatedAt">,
  ): Promise<Report>;
  updateReport(id: string, patch: Partial<Report>): Promise<Report>;
  deleteReport(id: string): Promise<void>;
  duplicateReport(id: string, newDate: string, author: User): Promise<Report>;

  // ---- Settings ----
  getSettings(): Promise<CompanySettings>;
  updateSettings(patch: Partial<CompanySettings>): Promise<CompanySettings>;

  // ---- Backup / Restore ----
  exportDatabase(): Promise<Database>;
  importDatabase(db: Database): Promise<void>;
  resetDatabase(): Promise<void>;
}
