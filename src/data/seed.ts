import type { Database, Report, ReportData, User } from "@/types";
import { emptyReportData } from "@/lib/calculations";
import { uid } from "@/lib/utils";

/**
 * Seed data. On first run this populates the JSON store so the app is
 * immediately usable with realistic history for the dashboard & analytics.
 */

export const DEFAULT_USERS: User[] = [
  {
    id: "u-admin",
    name: "Plant Administrator",
    displayName: "Plant Admin",
    username: "admin",
    email: "admin@cementplant.com",
    password: "admin123",
    role: "admin",
    active: true,
    createdAt: "2025-01-01T08:00:00.000Z",
    avatarColor: "#1d4ed8",
  },
  {
    id: "u-editor",
    name: "Shift Supervisor",
    displayName: "Shift Supervisor",
    username: "editor",
    email: "editor@cementplant.com",
    password: "editor123",
    role: "editor",
    active: true,
    createdAt: "2025-01-01T08:00:00.000Z",
    avatarColor: "#0ea5e9",
  },
];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Exact figures from the plant's master report (12/07/2026) — kept 1:1 so the
 *  generated PDF can be compared directly against the source document. */
const MASTER_DATE = "2026-07-12";
function masterData(): ReportData {
  return {
    bags50kg: { cementJetty: 550, godown: 5090, qMarineJetty: 0 },
    jumbo: { cementJetty: 182, totalCementMt: 250 },
    silo: { currentStock: 7023.99, sales: 554.5, production: 395.5 },
    emptyBags50kg: {
      china: { plant01: 22798, plant02: 50813, plant03: 17267, gStore: 70000 },
      indonesia: { plant01: 16675, plant02: 2995, plant03: 9124, gStore: 480000 },
    },
    emptyJumbo: { cementGodown: 273, cementJetty: 0, gStore: 3900 },
    netSlings: {
      new: { cementGodown: 9546, gStore: 0 },
      used: { cementGodown: 3418, gStore: 0 },
    },
    notes: "",
  };
}

/** Deterministic pseudo-random generator so seed history is stable per day. */
function rand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function seededData(dayIndex: number): ReportData {
  const r = rand(dayIndex + 101);
  const d = emptyReportData();
  const around = (base: number, spread: number) =>
    Math.round(base + (r() - 0.5) * spread);

  d.bags50kg.cementJetty = around(600, 400);
  d.bags50kg.godown = around(5000, 2500);
  d.bags50kg.qMarineJetty = around(120, 300);

  d.jumbo.cementJetty = around(180, 90);
  d.jumbo.totalCementMt = around(250, 120);

  d.silo.currentStock = around(7000, 2500);
  d.silo.production = around(400, 250);
  d.silo.sales = around(520, 280);

  d.emptyBags50kg.china.plant01 = around(22000, 8000);
  d.emptyBags50kg.china.plant02 = around(48000, 14000);
  d.emptyBags50kg.china.plant03 = around(17000, 6000);
  d.emptyBags50kg.china.gStore = around(70000, 20000);
  d.emptyBags50kg.indonesia.plant01 = around(16000, 6000);
  d.emptyBags50kg.indonesia.plant02 = around(3000, 2500);
  d.emptyBags50kg.indonesia.plant03 = around(9000, 3500);
  d.emptyBags50kg.indonesia.gStore = around(470000, 60000);

  d.emptyJumbo.cementGodown = around(300, 200);
  d.emptyJumbo.cementJetty = around(80, 160);
  d.emptyJumbo.gStore = around(3800, 1500);

  d.netSlings.new.cementGodown = around(9000, 3000);
  d.netSlings.new.gStore = around(120, 300);
  d.netSlings.used.cementGodown = around(3300, 1500);
  d.netSlings.used.gStore = around(80, 200);

  return d;
}

export function seedReports(days = 45): Report[] {
  const reports: Report[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = iso(date);
    // The master report is added separately — avoid a duplicate date.
    if (dateStr === MASTER_DATE) continue;
    // Skip a few days to look realistic (no report every single day).
    if (i !== 0 && i % 11 === 0) continue;

    const createdAt = new Date(date);
    createdAt.setHours(9, Math.floor(Math.random() * 40) + 5, 0, 0);
    const author = i % 3 === 0 ? DEFAULT_USERS[1] : DEFAULT_USERS[0];

    reports.push({
      id: uid("r-"),
      date: dateStr,
      status: "final",
      data: seededData(i),
      createdBy: author.id,
      createdByName: author.name,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      updatedByName: author.name,
    });
  }

  // Master report (exact figures from the source document).
  reports.push({
    id: uid("r-"),
    date: MASTER_DATE,
    status: "final",
    data: masterData(),
    createdBy: DEFAULT_USERS[0].id,
    createdByName: DEFAULT_USERS[0].name,
    createdAt: `${MASTER_DATE}T09:15:00.000Z`,
    updatedAt: `${MASTER_DATE}T09:15:00.000Z`,
    updatedByName: DEFAULT_USERS[0].name,
  });

  return reports;
}

export function seedDatabase(): Database {
  return {
    version: 2,
    users: DEFAULT_USERS,
    reports: seedReports(),
    settings: {
      companyName: "Cement Plant Industries",
      reportTitle: "CEMENT STOCK",
      pdfHeader: "Daily Stock Report",
      pdfFooter: "Confidential — Generated by CPSM",
      bagWeightMt: 0.05,
      defaultTheme: "system",
    },
  };
}
