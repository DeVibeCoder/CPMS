/**
 * Domain types for the Cement Plant Stock Management System.
 *
 * These types define the shape of the report exactly as it appears in the
 * daily manual document, so the JSON store, forms and PDF all agree.
 */

/**
 * Access roles:
 *  - admin    — full access to everything.
 *  - dispatch — can create, edit and generate (print/export) reports; view only otherwise.
 *  - viewer   — read-only. Can view reports and dashboards but not change anything.
 */
export type Role = "admin" | "dispatch" | "viewer";

export interface User {
  id: string;
  /** Full legal/HR name. */
  name: string;
  /** Preferred name shown in the UI (sidebar, greetings). Falls back to name. */
  displayName?: string;
  /** Login handle. Falls back to the email local-part. */
  username?: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  /** Fallback avatar tint when no picture is set. */
  avatarColor?: string;
  /** Uploaded profile picture as a data URL. */
  avatarUrl?: string;
}

/**
 * Payload for creating a user. The password is only ever an *input* — it is
 * never read back out of the store, so it lives here rather than on `User`.
 */
export type NewUser = Omit<User, "id" | "createdAt"> & { password: string };

/** Patch for updating a user. A non-empty `password` resets their password. */
export type UserPatch = Partial<Omit<User, "id" | "createdAt">> & {
  password?: string;
};

export type ReportStatus = "draft" | "final";

/** Section 1 — 50KG Bags Stock (bags counted at each location). */
export interface Bags50kgStock {
  cementJetty: number;
  godown: number;
  qMarineJetty: number;
}

/** Section 2 — Jumbo Bags Stock. Total Cement (MT) is entered directly on the
 *  master report (it is not a clean multiple of the bag count). */
export interface JumboStock {
  cementJetty: number;
  totalCementMt: number;
}

/** Section 3 — Silo Balance. */
export interface SiloBalance {
  currentStock: number;
  sales: number;
  production: number;
  /**
   * Cement refilled into the silos on this date, in MT (the "Refilling" figure
   * on the master document).
   *
   * Shipments are their own records now (see `Shipment`), because cement arrives
   * on its own schedule rather than on the daily reporting cycle. This field is
   * kept so the figure still prints on the report and survives a CSV round trip,
   * and the bin card falls back to it for any date with no shipment record — so
   * reports written before the shipments ledger existed still balance.
   *
   * Optional so every report written before this field existed still loads; an
   * absent value counts as zero.
   */
  newShipment?: number;
}

/** A grouped set of empty-bag locations (used for China & Indonesia). */
export interface EmptyBagGroup {
  plant01: number;
  plant02: number;
  plant03: number;
  gStore: number;
}

/** Section 4 — 50KG Empty Bags Stock. */
export interface EmptyBags50kg {
  china: EmptyBagGroup;
  indonesia: EmptyBagGroup;
}

/** Section 5 — Empty Jumbo Bags. */
export interface EmptyJumboBags {
  cementGodown: number;
  cementJetty: number;
  gStore: number;
}

/** A sling category row — quantities per location, total auto-summed. */
export interface SlingRow {
  cementGodown: number;
  gStore: number;
}

/** Section 6 — Net Slings. New & Used are category rows on the master report. */
export interface NetSlings {
  new: SlingRow;
  used: SlingRow;
}

export interface ReportData {
  bags50kg: Bags50kgStock;
  jumbo: JumboStock;
  silo: SiloBalance;
  emptyBags50kg: EmptyBags50kg;
  emptyJumbo: EmptyJumboBags;
  netSlings: NetSlings;
  /** Weight of one 50kg bag in MT for the jumbo/tonnage conversion. */
  notes?: string;
}

export interface Report {
  id: string;
  /** ISO date (YYYY-MM-DD) — the report date. One report per day is the norm. */
  date: string;
  status: ReportStatus;
  data: ReportData;
  createdBy: string; // user id
  createdByName: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  updatedByName?: string;
}

/**
 * A cement shipment received into the silos.
 *
 * Its own record rather than a field on the daily report: cement arrives when a
 * vessel or truck arrives, which is not the same rhythm as the daily reporting
 * cycle, and a shipment has to show on the bin card the moment it is logged —
 * not once somebody gets round to finalising that day's report.
 *
 * One row per date, matching the one-report-per-date rule. Logging a second
 * shipment for a date that already has one replaces the amount.
 */
export interface Shipment {
  id: string;
  /** ISO date (YYYY-MM-DD) the cement was received. */
  date: string;
  /** Quantity received, in MT. */
  amountMt: number;
  /** Free text — vessel name, truck reference, anything worth recording. */
  note?: string;
  createdBy: string; // user id
  createdByName: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/** Payload for logging a shipment. Timestamps and id are assigned by the store. */
export type NewShipment = Omit<Shipment, "id" | "createdAt" | "updatedAt">;

/**
 * Application settings.
 *
 * Company details and PDF branding used to live here. They are fixed constants
 * in `src/config/brand.ts` now — a single-plant deployment gains nothing from
 * making its own name editable, and everything to lose from the name on a
 * printed report drifting out of step with the plant.
 */
export interface CompanySettings {
  defaultTheme: "light" | "dark" | "system";
  /**
   * Cement bin-card anchor. The opening balance is entered by hand once, for
   * the first day; every balance after it is derived from finalised reports.
   */
  cementOpeningBalance?: number;
  /** ISO date (YYYY-MM-DD) the opening balance above applies to. */
  cementOpeningDate?: string;
}

export interface Database {
  users: User[];
  reports: Report[];
  /** Optional so a backup taken before the shipments ledger existed still restores. */
  shipments?: Shipment[];
  settings: CompanySettings;
  version: number;
}
