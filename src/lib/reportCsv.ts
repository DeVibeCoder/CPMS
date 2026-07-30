import type { Report, ReportData, ReportStatus } from "@/types";
import { emptyReportData } from "@/lib/calculations";

/**
 * Bulk import / export of stock reports as CSV.
 *
 * CSV rather than JSON on purpose: the point of this feature is loading years of
 * historical reports that currently live in spreadsheets, so the format has to
 * be one a plant clerk can open in Excel, paste into, and hand back.
 *
 * The layout is deliberately flat — one row per report date, one column per
 * field, in the order they appear on the report — so the template reads like the
 * paper form rather than like a database dump.
 */

interface Column {
  /** Header text written to the file. */
  header: string;
  /** Read the value out of a report. */
  get: (d: ReportData) => number | string;
  /** Write the value into a report being built. */
  set: (d: ReportData, value: string) => void;
}

const num = (value: string): number => {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Every editable field on the report, in report order.
 *
 * Adding a field to `ReportData` means adding one entry here; nothing else in
 * this file needs to change.
 */
const COLUMNS: Column[] = [
  // Section 1 — 50KG bags stock
  {
    header: "50KG Cement Jetty",
    get: (d) => d.bags50kg.cementJetty,
    set: (d, v) => (d.bags50kg.cementJetty = num(v)),
  },
  {
    header: "50KG Godown",
    get: (d) => d.bags50kg.godown,
    set: (d, v) => (d.bags50kg.godown = num(v)),
  },
  {
    header: "50KG Q-Marine Jetty",
    get: (d) => d.bags50kg.qMarineJetty,
    set: (d, v) => (d.bags50kg.qMarineJetty = num(v)),
  },
  // Section 2 — jumbo
  {
    header: "Jumbo Cement Jetty",
    get: (d) => d.jumbo.cementJetty,
    set: (d, v) => (d.jumbo.cementJetty = num(v)),
  },
  {
    header: "Jumbo Total Cement MT",
    get: (d) => d.jumbo.totalCementMt,
    set: (d, v) => (d.jumbo.totalCementMt = num(v)),
  },
  // Section 3 — silo
  {
    header: "Silo Current Stock MT",
    get: (d) => d.silo.currentStock,
    set: (d, v) => (d.silo.currentStock = num(v)),
  },
  {
    header: "Silo New Shipment MT",
    get: (d) => d.silo.newShipment ?? 0,
    set: (d, v) => (d.silo.newShipment = num(v)),
  },
  {
    header: "Silo Production MT",
    get: (d) => d.silo.production,
    set: (d, v) => (d.silo.production = num(v)),
  },
  {
    header: "Silo Sales MT",
    get: (d) => d.silo.sales,
    set: (d, v) => (d.silo.sales = num(v)),
  },
  // Section 4 — empty 50KG bags
  {
    header: "China Plant 01",
    get: (d) => d.emptyBags50kg.china.plant01,
    set: (d, v) => (d.emptyBags50kg.china.plant01 = num(v)),
  },
  {
    header: "China Plant 02",
    get: (d) => d.emptyBags50kg.china.plant02,
    set: (d, v) => (d.emptyBags50kg.china.plant02 = num(v)),
  },
  {
    header: "China Plant 03",
    get: (d) => d.emptyBags50kg.china.plant03,
    set: (d, v) => (d.emptyBags50kg.china.plant03 = num(v)),
  },
  {
    header: "China G-Store",
    get: (d) => d.emptyBags50kg.china.gStore,
    set: (d, v) => (d.emptyBags50kg.china.gStore = num(v)),
  },
  {
    header: "Indonesia Plant 01",
    get: (d) => d.emptyBags50kg.indonesia.plant01,
    set: (d, v) => (d.emptyBags50kg.indonesia.plant01 = num(v)),
  },
  {
    header: "Indonesia Plant 02",
    get: (d) => d.emptyBags50kg.indonesia.plant02,
    set: (d, v) => (d.emptyBags50kg.indonesia.plant02 = num(v)),
  },
  {
    header: "Indonesia Plant 03",
    get: (d) => d.emptyBags50kg.indonesia.plant03,
    set: (d, v) => (d.emptyBags50kg.indonesia.plant03 = num(v)),
  },
  {
    header: "Indonesia G-Store",
    get: (d) => d.emptyBags50kg.indonesia.gStore,
    set: (d, v) => (d.emptyBags50kg.indonesia.gStore = num(v)),
  },
  // Section 5 — empty jumbo
  {
    header: "Empty Jumbo Cement Godown",
    get: (d) => d.emptyJumbo.cementGodown,
    set: (d, v) => (d.emptyJumbo.cementGodown = num(v)),
  },
  {
    header: "Empty Jumbo Cement Jetty",
    get: (d) => d.emptyJumbo.cementJetty,
    set: (d, v) => (d.emptyJumbo.cementJetty = num(v)),
  },
  {
    header: "Empty Jumbo G-Store",
    get: (d) => d.emptyJumbo.gStore,
    set: (d, v) => (d.emptyJumbo.gStore = num(v)),
  },
  // Section 6 — net slings
  {
    header: "New Sling Cement Godown",
    get: (d) => d.netSlings.new.cementGodown,
    set: (d, v) => (d.netSlings.new.cementGodown = num(v)),
  },
  {
    header: "New Sling G-Store",
    get: (d) => d.netSlings.new.gStore,
    set: (d, v) => (d.netSlings.new.gStore = num(v)),
  },
  {
    header: "Used Sling Cement Godown",
    get: (d) => d.netSlings.used.cementGodown,
    set: (d, v) => (d.netSlings.used.cementGodown = num(v)),
  },
  {
    header: "Used Sling G-Store",
    get: (d) => d.netSlings.used.gStore,
    set: (d, v) => (d.netSlings.used.gStore = num(v)),
  },
  {
    header: "Remarks",
    get: (d) => d.notes ?? "",
    set: (d, v) => (d.notes = v),
  },
];

/** Fixed leading columns every row carries. */
const DATE_HEADER = "Date (YYYY-MM-DD)";
const STATUS_HEADER = "Status (draft/final)";

export const CSV_HEADERS = [DATE_HEADER, STATUS_HEADER, ...COLUMNS.map((c) => c.header)];

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/** Quote a field only when it needs it, so the file stays readable. */
function escape(value: string | number): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toLine(cells: Array<string | number>): string {
  return cells.map(escape).join(",");
}

export function reportsToCsv(reports: Report[]): string {
  const rows = reports
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) =>
      toLine([r.date, r.status, ...COLUMNS.map((c) => c.get(r.data))]),
    );
  // A BOM makes Excel open UTF-8 correctly instead of mangling the em dash.
  return "﻿" + [toLine(CSV_HEADERS), ...rows].join("\r\n") + "\r\n";
}

/**
 * A blank template with two worked example rows.
 *
 * Examples rather than an empty grid: the single most common import failure is a
 * misformatted date, and showing a correct one is more effective than a note
 * telling somebody what format to use.
 */
export function templateCsv(): string {
  const blank = emptyReportData();
  const example = (date: string, status: ReportStatus) =>
    toLine([date, status, ...COLUMNS.map((c) => c.get(blank))]);
  return (
    "﻿" +
    [
      toLine(CSV_HEADERS),
      example("2026-07-01", "final"),
      example("2026-07-02", "final"),
    ].join("\r\n") +
    "\r\n"
  );
}

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

/**
 * Split one CSV line, honouring quoted fields and escaped quotes.
 *
 * Hand-rolled rather than pulled from a library: this is the only CSV the app
 * reads, and a dependency for thirty lines would be the larger cost.
 */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Split a file into logical lines, ignoring newlines inside quoted fields. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(current);
      current = "";
    } else current += ch;
  }
  if (current.length > 0) lines.push(current);
  return lines.filter((l) => l.trim().length > 0);
}

export interface ParsedRow {
  date: string;
  status: ReportStatus;
  data: ReportData;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Human-readable problems, one per offending line. */
  errors: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an import file.
 *
 * Columns are matched by *header name*, not position, so a file with columns
 * reordered or extra columns added still imports. Every problem is collected
 * rather than thrown on the first one — a clerk importing three years of history
 * needs the whole list of bad rows, not just the earliest.
 */
export function parseReportsCsv(text: string): ParseResult {
  const lines = splitLines(text.replace(/^﻿/, ""));
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const indexOf = (name: string) =>
    headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const dateIdx = indexOf(DATE_HEADER);
  const statusIdx = indexOf(STATUS_HEADER);
  if (dateIdx === -1) {
    return {
      rows: [],
      errors: [
        `No "${DATE_HEADER}" column found. Download the template and use its headers.`,
      ],
    };
  }

  const columnIndex = COLUMNS.map((c) => indexOf(c.header));

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const lineNo = i + 1;
    const date = (cells[dateIdx] ?? "").trim();

    if (!date) continue; // a blank trailing row is not an error
    if (!ISO_DATE.test(date)) {
      errors.push(`Line ${lineNo}: "${date}" is not a YYYY-MM-DD date.`);
      continue;
    }
    if (Number.isNaN(Date.parse(`${date}T00:00:00`))) {
      errors.push(`Line ${lineNo}: "${date}" is not a real date.`);
      continue;
    }
    if (seen.has(date)) {
      errors.push(`Line ${lineNo}: ${date} appears more than once in the file.`);
      continue;
    }
    seen.add(date);

    const rawStatus = (cells[statusIdx] ?? "final").trim().toLowerCase();
    if (rawStatus && rawStatus !== "draft" && rawStatus !== "final") {
      errors.push(
        `Line ${lineNo}: status "${rawStatus}" must be either draft or final.`,
      );
      continue;
    }

    const data = emptyReportData();
    COLUMNS.forEach((col, idx) => {
      const at = columnIndex[idx];
      if (at === -1) return; // column absent — leave the zeroed default
      col.set(data, (cells[at] ?? "").trim());
    });

    rows.push({
      date,
      status: (rawStatus || "final") as ReportStatus,
      data,
    });
  }

  return { rows, errors };
}

/** Trigger a browser download for generated text. */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
