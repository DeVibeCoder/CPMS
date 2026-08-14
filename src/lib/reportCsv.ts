import {
  WEATHER_BANDS,
  type Report,
  type ReportData,
  type ReportStatus,
} from "@/types";
import { emptyReportData } from "@/lib/calculations";
import { WEATHER_OPTIONS, weatherLabel } from "@/lib/weather";
import { readCsv, toCsvFile, toLine } from "@/lib/csv";

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
 * A machine that writes semicolon-delimited CSV writes 1,5 for one and a half.
 * `num` strips commas as thousands separators, which would read that as 15 — so
 * the decimal comma has to become a point before it gets there. Only a bare
 * number is touched, leaving Remarks and the weather columns as typed.
 */
const decimalise = (value: string, delimiter: string): string =>
  delimiter !== "," && /^-?\d+,\d+$/.test(value) ? value.replace(",", ".") : value;

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
  // Weather — one column per band, so a spreadsheet can be sorted by it.
  // Unrecognised text is ignored rather than stored: the printed sheet has to
  // read as one of the three conditions, not whatever was typed into Excel.
  ...WEATHER_BANDS.map(
    (band): Column => ({
      header: `Weather ${band.label}`,
      get: (d) => weatherLabel(d.weather?.[band.key]),
      set: (d, v) => {
        const match = WEATHER_OPTIONS.find(
          (o) => o.label.toLowerCase() === v.trim().toLowerCase(),
        );
        if (match) d.weather = { ...d.weather, [band.key]: match.value };
      },
    }),
  ),
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

export function reportsToCsv(reports: Report[]): string {
  const rows = reports
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) =>
      toLine([r.date, r.status, ...COLUMNS.map((c) => c.get(r.data))]),
    );
  return toCsvFile([toLine(CSV_HEADERS), ...rows]);
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
  return toCsvFile([
    toLine(CSV_HEADERS),
    example("2026-07-01", "final"),
    example("2026-07-02", "final"),
  ]);
}

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

export interface ParsedRow {
  date: string;
  status: ReportStatus;
  data: ReportData;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Human-readable problems, one per offending line. */
  errors: string[];
  /**
   * How the date column was read, e.g. "M/D/YYYY". Surfaced in the import
   * results so a file Excel rewrote is never interpreted silently.
   */
  dateFormat?: string;
}

// -----------------------------------------------------------------------------
// Dates.
//
// The template writes YYYY-MM-DD, but almost nobody imports the file the
// template produced: they open it in Excel, and Excel rewrites the date column
// into the machine's locale format on save — 2026-07-01 becomes 7/1/2026 — with
// no way for the user to stop it short of formatting the column as text. A
// strict parser turns that into thirty identical errors and a clerk who thinks
// they mistyped every row.
//
// So day/month/year order is *inferred from the file as a whole* rather than
// assumed. Across a month of daily reports some day lands past the 12th, which
// settles the orientation for every row at once. A file too short or too
// ambiguous to settle it is rejected with an instruction rather than guessed at
// — importing 7/1 as January when it meant July would silently misfile stock.
// -----------------------------------------------------------------------------

/** Canonical, and always preferred: YYYY-MM-DD (or YYYY/M/D). */
const ISO = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
/** Two small numbers then a year — orientation unknown until the file is read. */
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
/** A month *name* is unambiguous wherever it sits: 01-Jul-2026, Jul 1 2026. */
const DAY_MONTH_NAME = /^(\d{1,2})[ \-/]([A-Za-z]{3,9})[ \-/](\d{4})$/;
const MONTH_NAME_DAY = /^([A-Za-z]{3,9})[ \-/](\d{1,2})[ \-/,]+(\d{4})$/;

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Build an ISO date, or null when those numbers are not a real day.
 *
 * Round-tripping through `Date` is what catches 31 April and 30 February — a
 * range check on the parts alone lets both through.
 */
function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function monthFromName(name: string): number {
  return MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

type Orientation = "dmy" | "mdy" | "ambiguous" | "conflict";

/**
 * Decide whether the file's numeric dates are day-first or month-first.
 *
 * A value above 12 in a slot can only be a day, so one such row settles the
 * whole file. Evidence for both is a corrupt or hand-merged file, not a format.
 */
function detectOrientation(raw: string[]): Orientation {
  let dayFirst = false;
  let monthFirst = false;
  for (const value of raw) {
    const m = NUMERIC.exec(value);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (dayFirst && monthFirst) return "conflict";
  if (dayFirst) return "dmy";
  if (monthFirst) return "mdy";
  return "ambiguous";
}

/** Normalise one cell to ISO. Returns the reason when it cannot. */
function normaliseDate(
  value: string,
  orientation: Orientation,
): { date: string } | { error: string } {
  const iso = ISO.exec(value);
  if (iso) {
    const date = toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { date } : { error: `"${value}" is not a real date.` };
  }

  const named =
    DAY_MONTH_NAME.exec(value) ?? MONTH_NAME_DAY.exec(value);
  if (named) {
    const dayFirstForm = DAY_MONTH_NAME.test(value);
    const day = Number(dayFirstForm ? named[1] : named[2]);
    const month = monthFromName(dayFirstForm ? named[2] : named[1]);
    if (month === 0) return { error: `"${value}" has no month I recognise.` };
    const date = toIso(Number(named[3]), month, day);
    return date ? { date } : { error: `"${value}" is not a real date.` };
  }

  const numeric = NUMERIC.exec(value);
  if (numeric) {
    if (orientation === "ambiguous") {
      return {
        error:
          `"${value}" could be day/month or month/day and the file gives no ` +
          `way to tell. Use YYYY-MM-DD (e.g. 2026-07-01).`,
      };
    }
    if (orientation === "conflict") {
      return {
        error:
          `"${value}" cannot be read: the file mixes day/month and month/day ` +
          `dates. Use YYYY-MM-DD (e.g. 2026-07-01).`,
      };
    }
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const day = orientation === "dmy" ? first : second;
    const month = orientation === "dmy" ? second : first;
    const date = toIso(Number(numeric[3]), month, day);
    return date ? { date } : { error: `"${value}" is not a real date.` };
  }

  return { error: `"${value}" is not a date I can read. Use YYYY-MM-DD.` };
}

const ORIENTATION_LABEL: Record<Orientation, string> = {
  dmy: "D/M/YYYY (day first)",
  mdy: "M/D/YYYY (month first)",
  ambiguous: "YYYY-MM-DD",
  conflict: "mixed — could not be determined",
};

/**
 * Parse an import file.
 *
 * Columns are matched by *header name*, not position, so a file with columns
 * reordered or extra columns added still imports. Every problem is collected
 * rather than thrown on the first one — a clerk importing three years of history
 * needs the whole list of bad rows, not just the earliest.
 */
export function parseReportsCsv(text: string): ParseResult {
  const { lines, delimiter, split, indexOf } = readCsv(text);
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };

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

  // Pass one: split every line and collect the raw dates. Orientation is a
  // property of the file, so no row can be converted until all of them are in.
  const parsed = lines.slice(1).map((line, i) => {
    const cells = split(line);
    return { cells, lineNo: i + 2, raw: (cells[dateIdx] ?? "").trim() };
  });

  const orientation = detectOrientation(
    parsed.map((p) => p.raw).filter(Boolean),
  );

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let usedNumeric = false;

  // Pass two: convert.
  for (const { cells, lineNo, raw } of parsed) {
    if (!raw) continue; // a blank trailing row is not an error

    const resolved = normaliseDate(raw, orientation);
    if ("error" in resolved) {
      errors.push(`Line ${lineNo}: ${resolved.error}`);
      continue;
    }
    const { date } = resolved;
    if (NUMERIC.test(raw)) usedNumeric = true;

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
      col.set(data, decimalise((cells[at] ?? "").trim(), delimiter));
    });

    rows.push({
      date,
      status: (rawStatus || "final") as ReportStatus,
      data,
    });
  }

  return {
    rows,
    errors,
    // Only worth reporting when it was actually inferred. A file already in
    // YYYY-MM-DD was not interpreted, so saying so would be noise.
    dateFormat: usedNumeric ? ORIENTATION_LABEL[orientation] : undefined,
  };
}
