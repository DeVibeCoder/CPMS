// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import type {
  AttendanceStatus,
  Employee,
  TimeBreak,
  TimesheetEntry,
} from "../../types/attendance.ts";
import { formatDayMonthYear, parseDayMonthYear } from "./calculations.ts";
import { readCsv, toCsvFile, toLine } from "../csv.ts";

/**
 * Bulk import of a day's timings as CSV.
 *
 * The plant does not read its clock times off this screen first. They arrive on
 * a gate register or an export from a punch clock, and somebody was retyping
 * forty rows of them every morning — which is slow, and which is also where the
 * typos come from. So the same shape the timesheet shows is offered as a file: a
 * template that comes down already carrying the staff, the date and whatever has
 * been entered so far, and an import that reads it back.
 *
 * Eight columns, in the order they read across the tab. Emp ID and Date are the
 * key — one person, one day — and everything else is what that row holds.
 *
 * Two rules are worth stating here, because they are the whole reason this is
 * more than a paste:
 *
 * A blank cell changes nothing. A file is usually a partial day — one section's
 * register, or the morning shift — and a clerk who leaves End empty because the
 * shift has not finished must not have an End already recorded wiped by
 * importing it. Clearing a time is done on the screen, where you can see what
 * you are clearing.
 *
 * The file cannot argue with the Status tab. Status on the timesheet is derived
 * from what is booked against a person and has no control that can disagree with
 * it, and a file must not become the back door into doing what the screen
 * refuses. A row giving times for somebody booked on vacation is rejected — not
 * applied, not applied-and-flagged — and so is a row calling somebody's day a
 * vacation when nothing is booked. See `resolveTimings` below.
 */

const ID_HEADER = "Emp ID";
const NAME_HEADER = "Name";
const DATE_HEADER = "Date (dd/mm/yyyy)";
const START_HEADER = "Start";
const BREAKS_HEADER = "Breaks";
const END_HEADER = "End";
const STATUS_HEADER = "Status";
const REMARKS_HEADER = "Remarks";

export const TIMESHEET_CSV_HEADERS = [
  ID_HEADER,
  NAME_HEADER,
  DATE_HEADER,
  START_HEADER,
  BREAKS_HEADER,
  END_HEADER,
  STATUS_HEADER,
  REMARKS_HEADER,
];

/** The words the Status column is written with, and read back in. */
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  vacation: "Vacation",
  sick: "Sick",
  "off-site": "Off site",
};

// -----------------------------------------------------------------------------
// Breaks
// -----------------------------------------------------------------------------
// A day can have more than one gap — the ordinary break and a stand-down for
// weather — so one column has to hold a list. Semicolons separate the gaps, a
// dash separates the two ends of one, and anything after the times is the
// reason: "12:00-13:00 LUNCH; 14:30-16:00 RAIN".
//
// A column per gap was the alternative and is worse: the number of gaps is not
// fixed, so the header row would have to guess a maximum, and the first day with
// one more break than that is a day the template cannot express.

/** Write the gaps as one cell. Empty when the day had none. */
export function breaksToCell(breaks: TimeBreak[] | undefined): string {
  if (!breaks?.length) return "";
  return breaks
    .map((b) => `${b.from}-${b.to}${b.reason ? ` ${b.reason}` : ""}`)
    .join("; ");
}

/**
 * Read the gaps back.
 *
 * An unreadable gap is an error rather than a silently dropped one: a break the
 * import quietly discarded would add an hour to somebody's day, and nothing on
 * the screen would say why.
 */
export function parseBreaksCell(
  raw: string,
): { breaks: TimeBreak[] } | { error: string } {
  const text = raw.trim();
  if (!text) return { breaks: [] };

  const breaks: TimeBreak[] = [];
  for (const piece of text.split(/[;|]/)) {
    const gap = piece.trim();
    if (!gap) continue;

    // Every dash, because a spreadsheet's autocorrect turns the one that was
    // typed into one that was not.
    const match = /^(.+?)\s*(?:-|–|—|\bto\b)\s*(\S+)\s*(.*)$/i.exec(gap);
    if (!match) {
      return { error: `break "${gap}" is not a from-to pair, e.g. 12:00-13:00.` };
    }

    const from = readTime(match[1]);
    const to = readTime(match[2]);
    if (!from || !to) {
      return { error: `break "${gap}" does not read as two times.` };
    }
    const reason = match[3].trim().toUpperCase();
    breaks.push({ from, to, ...(reason ? { reason } : {}) });
  }
  return { breaks };
}

// -----------------------------------------------------------------------------
// Times
// -----------------------------------------------------------------------------

/**
 * Read a clock time out of a cell, in whatever form the spreadsheet left it.
 *
 * More forgiving than the field on screen, and deliberately so: `parseTyped`
 * reads what somebody types on a keypad, while this reads what Excel *writes*,
 * which is a different and less predictable thing. A column formatted as a time
 * comes back as "07:00:00", one formatted in a US locale as "7:00 AM", and one
 * left as text as whatever the clerk put in it.
 *
 * Seconds are dropped rather than rounded with — the module holds HH:mm, and a
 * gate register's seconds are noise. Anything that is not a time returns null,
 * so the row gets reported instead of guessed at.
 */
export function readTime(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const pm = /p\.?m\.?$/.test(text);
  const am = /a\.?m\.?$/.test(text);
  const body = text.replace(/[ap]\.?m\.?$/, "").trim();

  const parts = body.split(/[:.\s]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d{1,4}$/.test(p))) return null;

  let hours: number;
  let minutes: number;
  if (parts.length === 1) {
    // The keypad forms: 7, 07, 700, 0700.
    const digits = parts[0];
    hours = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, -2));
    minutes = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  } else {
    if (parts[1].length > 2) return null;
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  }

  // Midnight is 12 AM and noon is 12 PM, which is the one place a 12-hour clock
  // is not simply "add twelve".
  if (am && hours === 12) hours = 0;
  if (pm && hours < 12) hours += 12;

  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Read the Status cell.
 *
 * Blank is not "Present": it is "the file does not say", which is a different
 * thing and the one a partial register actually means. Only an explicit word is
 * checked against what is booked.
 */
function readStatus(
  value: string,
): { status: AttendanceStatus | null } | { error: string } {
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!v) return { status: null };

  if (["present", "onsite", "on", "atwork", "working", "worked", "p"].includes(v)) {
    return { status: "present" };
  }
  if (["vacation", "leave", "annualleave", "holiday", "onleave", "v"].includes(v)) {
    return { status: "vacation" };
  }
  if (["sick", "sickleave", "medical", "ill", "s"].includes(v)) {
    return { status: "sick" };
  }
  if (["offsite", "off", "away", "absent", "o"].includes(v)) {
    return { status: "off-site" };
  }

  return {
    error: `status "${value.trim()}" must be one of Present, Vacation, Sick or Off site.`,
  };
}

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/** One person's row as the file holds it. */
export interface TimesheetCsvRow {
  employee: Employee;
  entry?: TimesheetEntry;
}

/**
 * The day's sheet as a file: the template and the export are the same thing.
 *
 * It comes down filled in — the staff, the date, and every time already
 * entered — rather than blank, because a blank grid means retyping the two
 * columns that identify a row before reaching the one you opened it to fill in.
 * Downloading it, typing the times and importing it back changes only what was
 * actually edited.
 */
export function timesheetCsv(date: string, rows: TimesheetCsvRow[]): string {
  const day = formatDayMonthYear(date);
  const lines = rows
    .slice()
    .sort((a, b) => a.employee.id.localeCompare(b.employee.id))
    .map(({ employee, entry }) =>
      toLine([
        employee.id,
        employee.name,
        day,
        entry?.start ?? "",
        breaksToCell(entry?.breaks),
        entry?.end ?? "",
        STATUS_LABELS[entry?.status ?? "present"],
        entry?.remarks ?? "",
      ]),
    );
  return toCsvFile([toLine(TIMESHEET_CSV_HEADERS), ...lines]);
}

// -----------------------------------------------------------------------------
// Reading
// -----------------------------------------------------------------------------

/** One row of a filled template, read but not yet checked against the plant. */
export interface ParsedTiming {
  employeeId: string;
  /** ISO, YYYY-MM-DD. */
  date: string;
  start?: string;
  end?: string;
  /** Null when the column was blank, which means "leave the gaps as they are". */
  breaks: TimeBreak[] | null;
  /** Null when the column was blank — the file is not saying. */
  status: AttendanceStatus | null;
  remarks?: string;
  /** The line it came from, so an error can point at it. */
  line: number;
}

export interface TimingParseResult {
  rows: ParsedTiming[];
  /** Human-readable problems, one per offending line. */
  errors: string[];
}

/**
 * Parse a filled template.
 *
 * Columns are matched by header name, so a file with columns reordered or extra
 * columns added still imports. Every problem is collected rather than thrown on
 * the first one — a clerk importing a whole plant's day needs the full list of
 * bad rows, not just the earliest.
 *
 * Nothing here knows what is booked against anybody; it only reads the file.
 * What the plant's own records make of it is `resolveTimings`, below.
 */
export function parseTimesheetCsv(text: string): TimingParseResult {
  const { lines, split, indexOf } = readCsv(text);
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };

  const idIdx = indexOf(ID_HEADER);
  // The date header carries its own format hint, so a file that shortened it to
  // "Date" is still read rather than rejected over the bracket.
  const fullDateIdx = indexOf(DATE_HEADER);
  const dateIdx = fullDateIdx === -1 ? indexOf("Date") : fullDateIdx;
  const startIdx = indexOf(START_HEADER);
  const breaksIdx = indexOf(BREAKS_HEADER);
  const endIdx = indexOf(END_HEADER);
  const statusIdx = indexOf(STATUS_HEADER);
  const remarksIdx = indexOf(REMARKS_HEADER);

  const missing = [idIdx === -1 && ID_HEADER, dateIdx === -1 && "Date"].filter(
    Boolean,
  );
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        `No ${missing.map((m) => `"${m}"`).join(" or ")} column found. ` +
          `Download the template and use its headers.`,
      ],
    };
  }

  const rows: ParsedTiming[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2;
    const cells = split(line);
    const cell = (at: number) => (at === -1 ? "" : (cells[at] ?? "").trim());

    const rawId = cell(idIdx);
    const rawDate = cell(dateIdx);
    // Neither is the blank line Excel leaves at the end of a file.
    if (!rawId && !rawDate) return;

    const employeeId = rawId.toUpperCase();
    if (!employeeId) {
      errors.push(`Line ${lineNo}: no employee ID.`);
      return;
    }

    // Both forms are read: the template writes 25/12/2026, and a spreadsheet
    // that reformatted the column as a date often hands back 2026-12-25.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : parseDayMonthYear(rawDate);
    if (!date) {
      errors.push(
        `Line ${lineNo}: ${employeeId} — "${rawDate}" is not a date. Write it as dd/mm/yyyy.`,
      );
      return;
    }

    const key = `${employeeId}|${date}`;
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push(
        `Line ${lineNo}: ${employeeId} appears twice for ${formatDayMonthYear(date)} — also on line ${first}.`,
      );
      return;
    }

    const rawStart = cell(startIdx);
    const rawEnd = cell(endIdx);
    const start = rawStart ? readTime(rawStart) : undefined;
    const end = rawEnd ? readTime(rawEnd) : undefined;
    if (rawStart && !start) {
      errors.push(
        `Line ${lineNo}: ${employeeId} — start "${rawStart}" is not a time.`,
      );
      return;
    }
    if (rawEnd && !end) {
      errors.push(`Line ${lineNo}: ${employeeId} — end "${rawEnd}" is not a time.`);
      return;
    }

    const rawBreaks = cell(breaksIdx);
    const gaps = rawBreaks
      ? parseBreaksCell(rawBreaks)
      : { breaks: null as TimeBreak[] | null };
    if ("error" in gaps) {
      errors.push(`Line ${lineNo}: ${employeeId} — ${gaps.error}`);
      return;
    }

    const status = readStatus(cell(statusIdx));
    if ("error" in status) {
      errors.push(`Line ${lineNo}: ${employeeId} — ${status.error}`);
      return;
    }

    const remarks = cell(remarksIdx);
    seen.set(key, lineNo);
    rows.push({
      employeeId,
      date,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      breaks: gaps.breaks,
      status: status.status,
      ...(remarks ? { remarks } : {}),
      line: lineNo,
    });
  });

  return { rows, errors };
}

// -----------------------------------------------------------------------------
// Checking a parsed file against the plant's own records
// -----------------------------------------------------------------------------

/** What the module knows that a file does not. Injected, so this stays pure. */
export interface TimingContext {
  /** Whether the staff number is one the plant has. */
  known: (employeeId: string) => boolean;
  /** Whether they were still employed on that date. */
  employedOn: (employeeId: string, date: string) => boolean;
  /** What is booked against them that day, or null for an ordinary working day. */
  bookedStatus: (employeeId: string, date: string) => AttendanceStatus | null;
  /** Whether the day has been completed and locked. */
  isSubmitted: (date: string) => boolean;
  /**
   * The oldest date the module has loaded.
   *
   * Attendance is a working record and holds the last six months on screen, so a
   * row older than that would be written to a day nobody can open — saved, and
   * then gone the next time the page loads. Refused instead, with the reason.
   */
  earliest: string;
  today: string;
}

/** One row that survived, reduced to the change it makes. */
export interface TimingChange {
  employeeId: string;
  date: string;
  start?: string;
  end?: string;
  /** Absent when the column was blank — the gaps already recorded stay. */
  breaks?: TimeBreak[];
  remarks?: string;
}

export interface ResolvedTimings {
  /** Rows to apply, in file order. */
  changes: TimingChange[];
  /**
   * Rows that were fine and asked for nothing: somebody away on that date whose
   * row agrees they were away, and a row with every cell left empty. Counted
   * rather than reported, because neither is a mistake to go and fix.
   */
  skipped: number;
  /** Rows refused, one message each, naming the line. */
  errors: string[];
  /** The dates the surviving rows touch, earliest first. */
  dates: string[];
}

/**
 * Decide what a parsed file is allowed to do.
 *
 * This is where the file meets the records, and where "the import agrees with
 * the status" is enforced. Four kinds of row are refused outright rather than
 * partly applied:
 *
 *  - a staff number the plant does not have, or somebody who had already left;
 *  - a date in the future, one older than the months held on screen, or a day
 *    already completed — a completed day is a record, and reopening it is a
 *    deliberate act somebody takes on the screen;
 *  - times against somebody the Status tab has booked away. This is the one the
 *    plant asked for by name: a vacation already entered must not be overwritten
 *    by a register printed before it was booked. The row stops, and the message
 *    says where to go if the vacation is the thing that is wrong;
 *  - a Status cell naming a departure nothing has booked. The timesheet cannot
 *    create one — that is the Status tab's job — so a file claiming it would
 *    leave the screen showing something no record supports.
 *
 * Somebody who is away may appear in the file as Vacation, Sick or Off site with
 * no times, or be left out of it altogether. Both mean the same thing here and
 * both count as skipped: the row is already right, and there is nothing to do.
 */
export function resolveTimings(
  rows: ParsedTiming[],
  ctx: TimingContext,
): ResolvedTimings {
  const changes: TimingChange[] = [];
  const errors: string[] = [];
  const dates = new Set<string>();
  let skipped = 0;

  for (const row of rows) {
    const where = `Line ${row.line}: ${row.employeeId}`;
    const day = formatDayMonthYear(row.date);

    if (!ctx.known(row.employeeId)) {
      errors.push(
        `${where} is not on the staff list. Add them first, or correct the ID.`,
      );
      continue;
    }
    if (row.date > ctx.today) {
      errors.push(`${where} — ${day} has not happened yet.`);
      continue;
    }
    if (row.date < ctx.earliest) {
      errors.push(
        `${where} — ${day} is older than the six months of timesheets Attendance keeps open.`,
      );
      continue;
    }
    if (!ctx.employedOn(row.employeeId, row.date)) {
      errors.push(`${where} had already left the plant on ${day}.`);
      continue;
    }
    if (ctx.isSubmitted(row.date)) {
      errors.push(
        `${where} — ${day} is completed and locked. Reopen the day on the timesheet to change it.`,
      );
      continue;
    }

    const booked = ctx.bookedStatus(row.employeeId, row.date);
    const hasTimes = Boolean(row.start || row.end || row.breaks?.length);

    if (booked) {
      if (hasTimes) {
        errors.push(
          `${where} is booked as ${STATUS_LABELS[booked]} on ${day}, so no hours were taken from this row. ` +
            `Remove the times, or change the ${STATUS_LABELS[booked].toLowerCase()} on Employees → Status.`,
        );
        continue;
      }
      if (row.status && row.status !== booked) {
        errors.push(
          `${where} — the file says ${STATUS_LABELS[row.status]} for ${day} but a ${STATUS_LABELS[booked]} is booked. ` +
            `Departures are changed on Employees → Status.`,
        );
        continue;
      }
      // Named as away, or simply carried through the file with nothing in it.
      // Either way the row already says what the records say.
      skipped += 1;
      continue;
    }

    if (row.status && row.status !== "present") {
      errors.push(
        `${where} — the file says ${STATUS_LABELS[row.status]} for ${day} but nothing is booked. ` +
          `Record it on Employees → Status and the timesheet row fills itself in.`,
      );
      continue;
    }

    // A row with nothing in it is a line the clerk did not get to, not an
    // instruction to blank the day. Blank cells never clear what is stored.
    if (!hasTimes && !row.remarks && row.breaks === null) {
      skipped += 1;
      continue;
    }

    changes.push({
      employeeId: row.employeeId,
      date: row.date,
      ...(row.start ? { start: row.start } : {}),
      ...(row.end ? { end: row.end } : {}),
      ...(row.breaks ? { breaks: row.breaks } : {}),
      ...(row.remarks ? { remarks: row.remarks } : {}),
    });
    dates.add(row.date);
  }

  return { changes, skipped, errors, dates: [...dates].sort() };
}
