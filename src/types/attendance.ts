/**
 * Attendance domain types.
 *
 * Under development, on invented data. Kept apart from the stock-report types
 * in `src/types/index.ts` so nothing in the reporting pipeline starts depending
 * on a module whose rules are not settled.
 *
 * Times are "HH:mm" strings — what a timesheet holds, and what any future
 * backend will most likely send. Everything downstream converts to minutes
 * immediately; see `src/lib/attendance/calculations.ts`.
 */

export interface Employee {
  /** Plant staff number, e.g. "CP001". */
  id: string;
  name: string;
  department: string;
  position: string;
  active: boolean;
}

/** Why somebody is not on the clock. Present is the ordinary case. */
export type AttendanceStatus = "present" | "sick" | "vacation";

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "sick", label: "Sick" },
  { value: "vacation", label: "Vacation" },
];

/**
 * One person, one day.
 *
 * Times are optional throughout: a sick day has none, and a day somebody
 * clocked in for but never out of has only a start. Neither is the same as
 * "worked nothing", which is why the totals treat an unreadable pair as unknown
 * rather than zero.
 */
export interface TimesheetEntry {
  employeeId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  start?: string;
  /** Break length in minutes. A duration, not a clock time. */
  breakMinutes?: number;
  end?: string;
  status: AttendanceStatus;
  remarks?: string;
}

/** A day's entry with its arithmetic worked out. */
export interface EntryTotals {
  /** Minutes worked, or null when the times cannot be read. */
  workedMinutes: number | null;
  /** Minutes beyond the daily target. */
  overtimeMinutes: number;
}
