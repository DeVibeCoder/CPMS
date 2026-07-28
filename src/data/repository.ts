import type {
  CompanySettings,
  Database,
  NewUser,
  Report,
  User,
  UserPatch,
} from "@/types";

/**
 * Repository contract.
 *
 * The whole app talks to data *only* through this async interface. Two
 * implementations exist:
 *
 *  - `LocalRepository`    — JSON document in localStorage (offline / demo).
 *  - `AppwriteRepository` — Appwrite Auth + TablesDB (production).
 *
 * `src/data/index.ts` picks one at startup based on the environment. No page
 * or component imports a concrete implementation.
 *
 * The repository also owns the *session*: it is the thing that knows whether
 * a user is signed in, so `login` / `getCurrentUser` / `logout` live here
 * rather than in the auth store.
 */
export interface Repository {
  // ---- Session ----
  /** Sign in. Returns null when the credentials are wrong or the account is disabled. */
  login(email: string, password: string, remember: boolean): Promise<User | null>;
  /** Restore the signed-in user from a persisted session, if any. */
  getCurrentUser(): Promise<User | null>;
  /** Clear the persisted session. */
  logout(): Promise<void>;
  /** Change the signed-in user's own password. Throws if `current` is wrong. */
  changePassword(current: string, next: string): Promise<void>;

  // ---- Users ----
  listUsers(): Promise<User[]>;
  createUser(input: NewUser): Promise<User>;
  updateUser(id: string, patch: UserPatch): Promise<User>;
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
