import type { Employee, TimeBreak, TimesheetEntry } from "@/types/attendance";
// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. The type-only import above is erased, so it may use it.
import { addDays, startOfWeek, toISODate } from "../../lib/attendance/calculations.ts";

/**
 * Mock attendance data. **Nothing here is real.**
 *
 * The Attendance module is under development and deliberately not wired to
 * Supabase, the reports database, or any HR system. These are invented people
 * on invented shifts, so the screens can be reviewed before a single real name
 * is loaded.
 *
 * The patterns are written out rather than randomised: random times would move
 * on every reload and would not reliably contain the cases worth looking at.
 */

/**
 * The invented people the sample timesheets are written against.
 *
 * Every one is marked `sample`, which keeps them off the Employees tab while
 * leaving them on the timesheet and master sheet. That split is deliberate: a
 * plant opening the module should find an empty staff list to put its own people
 * into, but empty sheets behind it would show nothing of how the module works.
 */
const PLANT = "CEMENT PLANT";
const ADMIN = "ADMINISTRATION";

export const MOCK_EMPLOYEES: Employee[] = [
  { id: "CP001", name: "AHMED SHAREEF", department: PLANT, position: "OPERATOR", sample: true },
  { id: "CP002", name: "MOHAMED ISMAIL", department: PLANT, position: "TECHNICIAN", sample: true },
  { id: "CP003", name: "HASSAN ALI", department: PLANT, position: "SUPERVISOR", sample: true },
  { id: "CP004", name: "IBRAHIM NAZEER", department: PLANT, position: "OPERATOR", sample: true },
  { id: "CP005", name: "ADAM RIYAZ", department: PLANT, position: "MECHANIC", sample: true },
  { id: "CP006", name: "FATHIMATH MARIYAM", department: ADMIN, position: "ADMIN ASSISTANT", sample: true },
  { id: "CP007", name: "ALI WAHEED", department: PLANT, position: "OPERATOR", sample: true },
  { id: "CP008", name: "YOOSUF NASEEM", department: PLANT, position: "LOADER OPERATOR", sample: true },
  { id: "CP009", name: "AISHATH NAZLA", department: PLANT, position: "LAB TECHNICIAN", sample: true },
  { id: "CP010", name: "HUSSAIN RASHEED", department: PLANT, position: "ELECTRICIAN", sample: true },
  { id: "CP011", name: "ABDULLA SHAKIR", department: PLANT, position: "CRANE OPERATOR", sample: true },
  { id: "CP012", name: "MARIYAM SHIFA", department: ADMIN, position: "STORE KEEPER", sample: true },
];

export const MOCK_DEPARTMENTS = [
  ...new Set(MOCK_EMPLOYEES.map((e) => e.department)),
].sort();

/**
 * Each employee's ordinary day, and the exceptions worth showing.
 *
 * `end` is what makes the day long or short; the break is an hour for anybody
 * whose shift spans midday. The exceptions are keyed by how many days back from
 * today they fall, so the sample always contains something interesting near the
 * dates a reviewer will actually open.
 */
/** The plant's ordinary midday break, and the office's shorter one. */
const LUNCH: TimeBreak = { from: "12:00", to: "13:00", reason: "LUNCH" };
const SHORT_LUNCH: TimeBreak = { from: "12:30", to: "13:00", reason: "LUNCH" };

interface Pattern {
  start: string;
  end: string;
  /** The ordinary lunch window, as clock times. */
  lunch: TimeBreak;
  /** Keyed by days-ago. */
  exceptions?: Record<number, Partial<TimesheetEntry>>;
}

const PATTERNS: Record<string, Pattern> = {
  CP001: { start: "07:00", end: "16:00", lunch: LUNCH },
  CP002: {
    start: "07:00",
    end: "18:00",
    lunch: LUNCH,
    exceptions: { 3: { end: "20:00", remarks: "Vessel discharge" } },
  },
  CP003: { start: "07:00", end: "16:00", lunch: LUNCH },
  CP004: {
    start: "07:00",
    end: "16:00",
    lunch: LUNCH,
    exceptions: {
      // The day this module's break handling exists for: production stopped
      // for weather, the crew went off at 13:00 and came back at 15:00.
      2: {
        end: "18:00",
        breaks: [
          LUNCH,
          { from: "13:00", to: "15:00", reason: "RAIN — NO PRODUCTION" },
        ],
        remarks: "RELEASED FOR RAIN, BACK AT 1500",
      },
      5: { status: "sick", start: undefined, end: undefined, breaks: undefined },
    },
  },
  CP005: {
    start: "07:00",
    end: "17:00",
    lunch: LUNCH,
    exceptions: { 4: { status: "vacation", start: undefined, end: undefined, breaks: undefined } },
  },
  CP006: { start: "08:00", end: "17:00", lunch: LUNCH },
  CP007: {
    start: "19:00",
    end: "04:00",
    lunch: LUNCH,
    exceptions: { 1: { remarks: "Night shift — kiln watch" } },
  },
  CP008: {
    start: "07:00",
    end: "16:00",
    lunch: LUNCH,
    exceptions: { 6: { end: undefined, remarks: "No clock-out recorded" } },
  },
  CP009: { start: "08:00", end: "17:00", lunch: LUNCH },
  CP010: {
    start: "07:00",
    end: "19:00",
    lunch: LUNCH,
    exceptions: { 2: { end: "20:00", remarks: "Breakdown — packing line" } },
  },
  CP011: {
    start: "07:00",
    end: "16:00",
    lunch: LUNCH,
    exceptions: { 3: { status: "vacation", start: undefined, end: undefined, breaks: undefined } },
  },
  CP012: { start: "08:00", end: "16:00", lunch: SHORT_LUNCH },
};

/** How many days of history the mock data covers, including today. */
export const MOCK_DAYS = 21;

export const MOCK_TODAY = toISODate(new Date());

/**
 * Every mock entry.
 *
 * Sundays are skipped — the plant's week runs Monday to Saturday, and a column
 * of empty Sundays in the master sheet only makes it harder to read.
 *
 * Exceptions are counted in *working* days back, not calendar days. Keying them
 * on calendar days meant that whenever an exception's day happened to land on a
 * Sunday it was dropped along with the day, so the sample silently lost its sick
 * day or its rain day one week in seven depending on when it was opened.
 */
function buildEntries(today: string): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  const workingDays: string[] = [];
  for (let daysAgo = MOCK_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    if (new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0) continue;
    workingDays.push(date);
  }

  workingDays.forEach((date, index) => {
    const workingDaysAgo = workingDays.length - 1 - index;

    for (const employee of MOCK_EMPLOYEES) {
      const pattern = PATTERNS[employee.id];
      if (!pattern) continue;
      const exception = pattern.exceptions?.[workingDaysAgo];

      entries.push({
        employeeId: employee.id,
        date,
        start: pattern.start,
        end: pattern.end,
        breaks: [pattern.lunch],
        status: "present",
        ...exception,
      });
    }
  });

  return entries;
}

export const MOCK_ENTRIES: TimesheetEntry[] = buildEntries(MOCK_TODAY);

/**
 * Days already signed off.
 *
 * Everything before today, so the master sheet has something in it on first
 * open. Today is left open so the Complete button on the timesheet can actually
 * be used during a review.
 */
export const MOCK_SUBMITTED_DATES: string[] = [
  ...new Set(MOCK_ENTRIES.map((e) => e.date)),
].filter((date) => date < MOCK_TODAY);

/** Mondays covered by the mock data, newest first. */
export const MOCK_WEEK_STARTS: string[] = [
  ...new Set(MOCK_ENTRIES.map((e) => startOfWeek(e.date))),
].sort((a, b) => b.localeCompare(a));

/** Months covered by the mock data, newest first. */
export const MOCK_MONTHS: string[] = [
  ...new Set(MOCK_ENTRIES.map((e) => `${e.date.slice(0, 7)}-01`)),
].sort((a, b) => b.localeCompare(a));
