import type { Employee, TimesheetEntry } from "@/types/attendance";
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

export const MOCK_EMPLOYEES: Employee[] = [
  { id: "CP001", name: "Ahmed Shareef", department: "Production", position: "Operator", active: true },
  { id: "CP002", name: "Mohamed Ismail", department: "Maintenance", position: "Technician", active: true },
  { id: "CP003", name: "Hassan Ali", department: "Production", position: "Supervisor", active: true },
  { id: "CP004", name: "Ibrahim Nazeer", department: "Production", position: "Operator", active: true },
  { id: "CP005", name: "Adam Riyaz", department: "Maintenance", position: "Mechanic", active: true },
  { id: "CP006", name: "Fathimath Mariyam", department: "Administration", position: "Admin Assistant", active: true },
  { id: "CP007", name: "Ali Waheed", department: "Production", position: "Operator", active: true },
  { id: "CP008", name: "Yoosuf Naseem", department: "Logistics", position: "Loader Operator", active: true },
  { id: "CP009", name: "Aishath Nazla", department: "Quality Control", position: "Lab Technician", active: true },
  { id: "CP010", name: "Hussain Rasheed", department: "Maintenance", position: "Electrician", active: true },
  { id: "CP011", name: "Abdulla Shakir", department: "Logistics", position: "Crane Operator", active: true },
  { id: "CP012", name: "Mariyam Shifa", department: "Administration", position: "Store Keeper", active: true },
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
interface Pattern {
  start: string;
  end: string;
  breakMinutes: number;
  /** Keyed by days-ago. */
  exceptions?: Record<number, Partial<TimesheetEntry>>;
}

const PATTERNS: Record<string, Pattern> = {
  CP001: { start: "07:00", end: "16:00", breakMinutes: 60 },
  CP002: {
    start: "07:00",
    end: "18:00",
    breakMinutes: 60,
    exceptions: { 3: { end: "20:00", remarks: "Vessel discharge" } },
  },
  CP003: { start: "07:00", end: "16:00", breakMinutes: 60 },
  CP004: {
    start: "07:00",
    end: "16:00",
    breakMinutes: 60,
    exceptions: {
      2: { end: "13:00", remarks: "Released early — heavy rain" },
      5: { status: "sick", start: undefined, end: undefined, breakMinutes: undefined },
    },
  },
  CP005: {
    start: "07:00",
    end: "17:00",
    breakMinutes: 60,
    exceptions: { 4: { status: "vacation", start: undefined, end: undefined, breakMinutes: undefined } },
  },
  CP006: { start: "08:00", end: "17:00", breakMinutes: 60 },
  CP007: {
    start: "19:00",
    end: "04:00",
    breakMinutes: 60,
    exceptions: { 1: { remarks: "Night shift — kiln watch" } },
  },
  CP008: {
    start: "07:00",
    end: "16:00",
    breakMinutes: 60,
    exceptions: { 6: { end: undefined, remarks: "No clock-out recorded" } },
  },
  CP009: { start: "08:00", end: "17:00", breakMinutes: 60 },
  CP010: {
    start: "07:00",
    end: "19:00",
    breakMinutes: 60,
    exceptions: { 2: { end: "20:00", remarks: "Breakdown — packing line" } },
  },
  CP011: {
    start: "07:00",
    end: "16:00",
    breakMinutes: 60,
    exceptions: { 3: { status: "vacation", start: undefined, end: undefined, breakMinutes: undefined } },
  },
  CP012: { start: "08:00", end: "16:00", breakMinutes: 30 },
};

/** How many days of history the mock data covers, including today. */
export const MOCK_DAYS = 21;

export const MOCK_TODAY = toISODate(new Date());

/**
 * Every mock entry.
 *
 * Sundays are skipped — the plant's week runs Monday to Saturday, and a column
 * of empty Sundays in the master sheet only makes it harder to read.
 */
function buildEntries(today: string): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  for (let daysAgo = MOCK_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    if (new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0) continue;

    for (const employee of MOCK_EMPLOYEES) {
      const pattern = PATTERNS[employee.id];
      if (!pattern) continue;
      const exception = pattern.exceptions?.[daysAgo];

      entries.push({
        employeeId: employee.id,
        date,
        start: pattern.start,
        end: pattern.end,
        breakMinutes: pattern.breakMinutes,
        status: "present",
        ...exception,
      });
    }
  }

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
