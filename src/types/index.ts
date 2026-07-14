/**
 * Domain types for the Cement Plant Stock Management System.
 *
 * These types define the shape of the report exactly as it appears in the
 * daily manual document, so the JSON store, forms and PDF all agree.
 */

export type Role = "admin" | "editor";

export interface User {
  id: string;
  /** Full legal/HR name. */
  name: string;
  /** Preferred name shown in the UI (sidebar, greetings). Falls back to name. */
  displayName?: string;
  /** Login handle. Falls back to the email local-part. */
  username?: string;
  email: string;
  /** NOTE: mock auth. Replace with Supabase Auth / hashed passwords on migration. */
  password: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  /** Fallback avatar tint when no picture is set. */
  avatarColor?: string;
  /** Uploaded profile picture as a data URL. */
  avatarUrl?: string;
}

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

export interface CompanySettings {
  companyName: string;
  reportTitle: string;
  pdfHeader: string;
  pdfFooter: string;
  logoDataUrl?: string;
  /** MT equivalent of a single 50kg bag (0.05 MT). Used for conversions. */
  bagWeightMt: number;
  defaultTheme: "light" | "dark" | "system";
}

export interface Database {
  users: User[];
  reports: Report[];
  settings: CompanySettings;
  version: number;
}
