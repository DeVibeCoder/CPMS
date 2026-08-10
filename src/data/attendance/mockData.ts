import type { AttendanceRecord, Employee } from "@/types/attendance";
// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. Type-only imports above are erased, so they may use it.
import {
  addDays,
  startOfWeek,
  toISODate,
  weekDates,
} from "../../lib/attendance/calculations.ts";

/**
 * Mock attendance data. **Nothing here is real.**
 *
 * The Attendance module is under development and deliberately not wired to
 * Supabase, the reports database, or any HR system. These are invented people
 * on invented shifts, and they exist so the calculation engine can be exercised
 * against every case the plant described before a single real name is loaded.
 *
 * The patterns are written out by hand rather than randomised. Random times
 * would change on every reload, would not reliably contain the cases that
 * matter, and would make it impossible to say "this employee should show four
 * hours of compensation" and check it. Every week below is a deliberate
 * scenario — see WEEK_SHAPES.
 */

// -----------------------------------------------------------------------------
// People
// -----------------------------------------------------------------------------

export const MOCK_EMPLOYEES: Employee[] = [
  { id: "CP001", name: "Ahmed Shareef", department: "Production", position: "Operator", active: true },
  { id: "CP002", name: "Mohamed Ismail", department: "Maintenance", position: "Technician", active: true },
  { id: "CP003", name: "Hassan Ali", department: "Production", position: "Supervisor", active: true },
  { id: "CP004", name: "Ibrahim Nazeer", department: "Production", position: "Operator", active: true },
  { id: "CP005", name: "Adam Riyaz", department: "Maintenance", position: "Mechanic", active: true },
  { id: "CP006", name: "Fathimath Mariyam", department: "Administration", position: "Admin Assistant", active: true },
  { id: "CP007", name: "Ali Waheed", department: "Production", position: "Operator (Night)", active: true },
  { id: "CP008", name: "Yoosuf Naseem", department: "Logistics", position: "Loader Operator", active: true },
  { id: "CP009", name: "Aishath Nazla", department: "Quality Control", position: "Lab Technician", active: true },
  { id: "CP010", name: "Hussain Rasheed", department: "Maintenance", position: "Electrician", active: true },
  { id: "CP011", name: "Abdulla Shakir", department: "Logistics", position: "Crane Operator", active: true },
  { id: "CP012", name: "Mariyam Shifa", department: "Administration", position: "Store Keeper", active: true },
  { id: "CP013", name: "Ismail Rasheed", department: "Production", position: "Packing Operator", active: true },
  { id: "CP014", name: "Aminath Zeeniya", department: "Quality Control", position: "Quality Inspector", active: true },
];

export const MOCK_DEPARTMENTS = [
  ...new Set(MOCK_EMPLOYEES.map((e) => e.department)),
].sort();

// -----------------------------------------------------------------------------
// Week shapes
// -----------------------------------------------------------------------------

/**
 * Hours worked Monday to Saturday. `null` is a day with no usable record —
 * either nobody clocked in, or they clocked in and never out.
 */
interface WeekShape {
  hours: (number | null)[];
  /** Remarks keyed by weekday index, 0 = Monday. */
  remarks?: Record<number, string>;
  /** Clocked in but never out, keyed by weekday index. */
  openEnded?: number[];
  /** Shift starts at 19:00 and runs past midnight. */
  night?: boolean;
  /** Clock-in hour for a day shift. Administration starts later. */
  startHour?: number;
}

/**
 * Every scenario the plant asked to see, written once and reused.
 *
 * The comment on each is what the weekly engine should report for it, which is
 * also what makes these useful as a manual check against the Weekly tab.
 */
const WEEK_SHAPES: Record<string, WeekShape> = {
  // 48h. No shortfall, no overtime, no compensation.
  square: { hours: [8, 8, 8, 8, 8, 8] },

  // 48h, but Monday was cut short and Tuesday made it up: 2h compensation.
  compensated: {
    hours: [6, 10, 8, 8, 8, 8],
    remarks: { 0: "Released early — heavy rain, jetty closed" },
  },

  // 48h reached from a very short Monday: 3h compensation.
  earlyRelease: {
    hours: [5, 9, 8, 10, 8, 8],
    remarks: { 0: "Plant shutdown from 12:00 — kiln maintenance", 3: "Vessel discharge" },
  },

  // 50h. 2h genuine overtime, nothing to compensate.
  overtimeLight: { hours: [9, 9, 8, 8, 8, 8], remarks: { 0: "Vessel discharge" } },

  // 55h. 7h overtime.
  overtimeHeavy: {
    hours: [10, 10, 10, 9, 8, 8],
    remarks: { 0: "Vessel discharge", 1: "Vessel discharge", 2: "Silo transfer" },
  },

  // 52h with a short Monday: 2h compensation, then 4h overtime.
  compensatedAndOvertime: {
    hours: [6, 12, 10, 8, 8, 8],
    remarks: { 0: "Released early — weather", 1: "Vessel discharge" },
  },

  // 44h. 4h shortfall the week could not make up.
  shortfall: {
    hours: [8, 8, 6, 8, 8, 6],
    remarks: { 2: "Released early — plant conditions", 5: "Half day" },
  },

  // 40h worked, one day never recorded: 8h shortfall and a flagged gap.
  missingDay: {
    hours: [8, 8, null, 8, 8, 8],
    remarks: { 2: "No timesheet submitted" },
  },

  // 8h short of a full day because the clock-out was never entered.
  openEnded: {
    hours: [8, 8, 8, null, 8, 8],
    openEnded: [3],
    remarks: { 3: "Clocked in, no clock-out recorded" },
  },

  // 48h across six night shifts that each run past midnight.
  nights: { hours: [8, 8, 8, 8, 8, 8], night: true },

  // 44h — Saturday is a half day for the office.
  officeHalfSaturday: {
    hours: [8, 8, 8, 8, 8, 4],
    startHour: 8,
    remarks: { 5: "Office half day" },
  },

  // 48h from an uneven week: 2h compensation.
  uneven: { hours: [7, 9, 8, 8, 9, 7], remarks: { 5: "Released early — weather" } },
};

/**
 * Which shape each employee works, oldest week first.
 *
 * Four weeks each, chosen so that the four-week view contains employees who are
 * consistently square, consistently over, occasionally short, and occasionally
 * missing — rather than everybody drifting towards the same average.
 */
const ROSTER: Record<string, string[]> = {
  CP001: ["square", "square", "compensated", "square"],
  CP002: ["overtimeLight", "overtimeHeavy", "overtimeLight", "compensatedAndOvertime"],
  CP003: ["square", "square", "square", "square"],
  CP004: ["earlyRelease", "compensated", "square", "earlyRelease"],
  CP005: ["shortfall", "square", "shortfall", "uneven"],
  CP006: ["officeHalfSaturday", "officeHalfSaturday", "officeHalfSaturday", "officeHalfSaturday"],
  CP007: ["nights", "nights", "nights", "nights"],
  CP008: ["missingDay", "square", "openEnded", "square"],
  CP009: ["uneven", "square", "compensated", "square"],
  CP010: ["overtimeHeavy", "compensatedAndOvertime", "overtimeHeavy", "overtimeLight"],
  CP011: ["square", "shortfall", "compensated", "overtimeLight"],
  CP012: ["square", "square", "openEnded", "square"],
  CP013: ["compensated", "overtimeLight", "square", "shortfall"],
  CP014: ["square", "uneven", "square", "compensated"],
};

/** How many weeks of history the mock data covers, including this one. */
export const MOCK_WEEKS = 4;

// -----------------------------------------------------------------------------
// Building the records
// -----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (hour: number, minute = 0) => `${pad(hour % 24)}:${pad(minute)}`;

/**
 * Turn "eight hours on this date" into the four clock readings a timesheet
 * actually holds.
 *
 * A shift long enough to span midday takes an hour for lunch, so the clock-out
 * is an hour later than the hours worked; a short day ends before lunch and has
 * no break at all. That is both what happens at the plant and what keeps the
 * break out of the worked total honestly rather than by arithmetic that assumes
 * a break is always there.
 */
function buildRecord(
  employeeId: string,
  date: string,
  hours: number,
  shape: WeekShape,
  weekdayIndex: number,
): AttendanceRecord {
  const remarks = shape.remarks?.[weekdayIndex];
  const start = shape.night ? 19 : (shape.startHour ?? 7);
  const takesBreak = hours > 5;

  const record: AttendanceRecord = {
    employeeId,
    date,
    timeIn: clock(start),
    timeOut: clock(start + hours + (takesBreak ? 1 : 0)),
    ...(remarks ? { remarks } : {}),
  };

  if (takesBreak) {
    // Lunch at the midpoint of the shift for days, a half-hour meal break at
    // 23:00 for nights.
    const breakStart = shape.night ? 23 : 12;
    record.breakStart = clock(breakStart);
    record.breakEnd = clock(breakStart + 1);
  }
  return record;
}

/**
 * Every mock record, oldest first.
 *
 * Generated once at module load and never regenerated: the data is fixed, so a
 * figure quoted in a review still means the same thing an hour later.
 *
 * The current week is truncated at today. A timesheet showing hours somebody
 * has not worked yet would make every total in the UI wrong in a way that looks
 * like a bug in the calculations.
 */
function buildRecords(today: string): AttendanceRecord[] {
  const thisMonday = startOfWeek(today);
  const records: AttendanceRecord[] = [];

  for (const employee of MOCK_EMPLOYEES) {
    const shapes = ROSTER[employee.id] ?? ["square", "square", "square", "square"];

    shapes.forEach((shapeName, weekIndex) => {
      const shape = WEEK_SHAPES[shapeName];
      if (!shape) return;
      // weekIndex 0 is the oldest of the four weeks.
      const monday = addDays(thisMonday, (weekIndex - (MOCK_WEEKS - 1)) * 7);
      const dates = weekDates(monday);

      shape.hours.forEach((hours, dayIndex) => {
        const date = dates[dayIndex];
        if (date > today) return; // nothing in the future

        // A day the person clocked in for but never out of — a real and common
        // timesheet fault, and one the engine must not turn into a full day.
        if (shape.openEnded?.includes(dayIndex)) {
          records.push({
            employeeId: employee.id,
            date,
            timeIn: clock(shape.night ? 19 : (shape.startHour ?? 7)),
            remarks: shape.remarks?.[dayIndex],
          });
          return;
        }

        if (hours === null) return; // absent, no record at all
        records.push(buildRecord(employee.id, date, hours, shape, dayIndex));
      });
    });
  }

  return records;
}

/** Frozen at module load so the numbers do not move under a reviewer. */
export const MOCK_TODAY = toISODate(new Date());
export const MOCK_RECORDS: AttendanceRecord[] = buildRecords(MOCK_TODAY);

/** The Mondays covered by the mock data, newest first. */
export const MOCK_WEEK_STARTS: string[] = Array.from(
  { length: MOCK_WEEKS },
  (_, i) => addDays(startOfWeek(MOCK_TODAY), -i * 7),
);

/** The months the mock data touches, newest first. */
export const MOCK_MONTHS: string[] = [
  ...new Set(MOCK_WEEK_STARTS.map((w) => `${w.slice(0, 7)}-01`)),
].sort((a, b) => b.localeCompare(a));
