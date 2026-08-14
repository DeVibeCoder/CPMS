// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import type { Employee, PresenceStatus } from "../../types/attendance.ts";
import { readCsv, toCsvFile, toLine } from "../csv.ts";

/**
 * Bulk import / export of the staff list as CSV.
 *
 * The staff list is the one part of Attendance a plant already has written
 * down — it lives in an HR spreadsheet, not in this app — so loading it has to
 * be a file a clerk can open in Excel and hand back, rather than a dozen typed
 * forms.
 *
 * Five columns, in the order they read on the tab: staff number, name, what
 * they do, where they do it, and where they are. The headers use the plant's
 * words — designation and section — while the code keeps the `Employee` field
 * names (`position`, `department`), so the file matches the paper and the types
 * stay as they are.
 *
 * Status carries the same four words the tab shows — On site, Off site,
 * Vacation, Sick — rather than an active/inactive flag. A file is a snapshot of
 * where people are, and "Active" never told anybody anything they could act on.
 */

const ID_HEADER = "Emp ID";
const NAME_HEADER = "Name";
const DESIGNATION_HEADER = "Designation";
const SECTION_HEADER = "Section";
const STATUS_HEADER = "Status (On site/Off site/Vacation/Sick)";

export const EMPLOYEE_CSV_HEADERS = [
  ID_HEADER,
  NAME_HEADER,
  DESIGNATION_HEADER,
  SECTION_HEADER,
  STATUS_HEADER,
];

const STATUS_LABELS: Record<PresenceStatus, string> = {
  "on-site": "On site",
  "off-site": "Off site",
  vacation: "Vacation",
  sick: "Sick",
};

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/** One row per person, with where they are as at the moment of export. */
export function employeesToCsv(
  employees: Employee[],
  presenceOf: (employee: Employee) => PresenceStatus,
): string {
  const rows = employees
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) =>
      toLine([e.id, e.name, e.position, e.department, STATUS_LABELS[presenceOf(e)]]),
    );
  return toCsvFile([toLine(EMPLOYEE_CSV_HEADERS), ...rows]);
}

/**
 * A blank template with two worked example rows.
 *
 * Examples rather than an empty grid: showing one correct row answers what goes
 * in Status more reliably than a note explaining it. They are obvious
 * placeholders, so a clerk who forgets to delete them gets two rows named
 * "Example" rather than two plausible-looking staff.
 */
export function employeeTemplateCsv(): string {
  return toCsvFile([
    toLine(EMPLOYEE_CSV_HEADERS),
    toLine(["E001", "EXAMPLE NAME", "OPERATOR", "CEMENT PLANT", "On site"]),
    toLine(["E002", "EXAMPLE NAME TWO", "CLERK", "ADMINISTRATION", "Vacation"]),
  ]);
}

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

/**
 * Read the status cell.
 *
 * Blank means on site: a list exported from HR is usually just the staff, and
 * making an empty column mean "away" would book the whole plant off work.
 * Spellings a spreadsheet is likely to hold — onsite, present, at work, leave —
 * are accepted, and anything unrecognised is an error rather than a guess.
 */
function parseStatus(
  value: string,
): { presence: PresenceStatus } | { error: string } {
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!v) return { presence: "on-site" };

  if (["onsite", "on", "present", "atwork", "working", "active", "yes", "y", "true", "1"].includes(v)) {
    return { presence: "on-site" };
  }
  if (["offsite", "off", "away", "absent", "no", "n", "false", "0"].includes(v)) {
    return { presence: "off-site" };
  }
  if (["vacation", "leave", "annualleave", "holiday", "onleave"].includes(v)) {
    return { presence: "vacation" };
  }
  if (["sick", "sickleave", "medical", "ill"].includes(v)) {
    return { presence: "sick" };
  }

  return {
    error:
      `status "${value.trim()}" must be one of On site, Off site, Vacation or Sick.`,
  };
}

/** A parsed row: the person, plus where the file says they are. */
export interface ParsedEmployee extends Employee {
  presence: PresenceStatus;
}

export interface EmployeeParseResult {
  rows: ParsedEmployee[];
  /** Human-readable problems, one per offending line. */
  errors: string[];
}

/**
 * Parse a filled template.
 *
 * Columns are matched by header name, so a file with columns reordered or extra
 * columns added still imports. Every problem is collected rather than thrown on
 * the first one — a clerk loading a whole plant's staff needs the full list of
 * bad rows, not just the earliest.
 */
export function parseEmployeesCsv(text: string): EmployeeParseResult {
  const { lines, split, indexOf } = readCsv(text);
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };

  const idIdx = indexOf(ID_HEADER);
  const nameIdx = indexOf(NAME_HEADER);
  const designationIdx = indexOf(DESIGNATION_HEADER);
  const sectionIdx = indexOf(SECTION_HEADER);
  // The status header carries its own hint text, so a file that shortened it to
  // "Status" is still read rather than rejected over the bracket.
  const fullStatusIdx = indexOf(STATUS_HEADER);
  const statusIdx = fullStatusIdx === -1 ? indexOf("Status") : fullStatusIdx;

  const missing = [
    idIdx === -1 && ID_HEADER,
    nameIdx === -1 && NAME_HEADER,
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        `No ${missing.map((m) => `"${m}"`).join(" or ")} column found. ` +
          `Download the template and use its headers.`,
      ],
    };
  }

  const rows: ParsedEmployee[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2;
    const cells = split(line);
    const cell = (at: number) => (at === -1 ? "" : (cells[at] ?? "").trim());

    const id = cell(idIdx);
    const name = cell(nameIdx);
    // A row with neither is the blank line Excel leaves at the end of a file.
    if (!id && !name) return;

    if (!id) {
      errors.push(`Line ${lineNo}: no employee ID.`);
      return;
    }
    if (!name) {
      errors.push(`Line ${lineNo}: ${id} has no name.`);
      return;
    }

    const key = id.toUpperCase();
    if (seen.has(key)) {
      errors.push(`Line ${lineNo}: ${id} appears more than once in the file.`);
      return;
    }

    const status = parseStatus(cell(statusIdx));
    if ("error" in status) {
      errors.push(`Line ${lineNo}: ${status.error}`);
      return;
    }

    seen.add(key);
    rows.push({
      id,
      name,
      position: cell(designationIdx),
      department: cell(sectionIdx),
      presence: status.presence,
    });
  });

  return { rows, errors };
}
