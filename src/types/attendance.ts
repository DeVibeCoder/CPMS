/**
 * Attendance domain types.
 *
 * Kept apart from the stock-report types in `src/types/index.ts`: attendance is
 * a separate module running on mock data until the plant's policy is signed
 * off, and nothing in the report pipeline should start depending on it.
 *
 * Times are "HH:mm" strings because that is what a timesheet holds and what any
 * future backend will most likely send. Everything downstream converts to
 * minutes immediately — see `src/lib/attendance/calculations.ts`.
 */

export interface Employee {
  /** Plant staff number, e.g. "CP001". */
  id: string;
  name: string;
  /** Section within the plant. */
  department: string;
  position: string;
  active: boolean;
}

/**
 * One person, one day.
 *
 * Every time is optional. A day where somebody was released early has a
 * `timeOut` and no more; a day nobody clocked in has none at all, and must not
 * be silently counted as zero hours worked — that is the difference between
 * "absent" and "worked nothing", and the plant cares about it.
 */
export interface AttendanceRecord {
  employeeId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  timeIn?: string;
  breakStart?: string;
  breakEnd?: string;
  timeOut?: string;
  /** Free text — "released early, weather", "plant shutdown". */
  remarks?: string;
}

/** How a day is classified once the times have been read. */
export type DayStatus =
  | "normal" // met the daily target
  | "extra" // worked beyond the daily target
  | "short" // worked, but under the daily target
  | "missing" // expected in, no usable times
  | "off" // not a working day
  | "rest"; // a working day with no record and none expected

export interface DayResult {
  date: string;
  /** 0 = Sunday … 6 = Saturday, matching Date#getDay. */
  weekday: number;
  record?: AttendanceRecord;
  /** Minutes actually worked, or null when the times cannot be read. */
  workedMinutes: number | null;
  breakMinutes: number;
  targetMinutes: number;
  /** worked − target. Negative is a shortfall. Null when unknown. */
  differenceMinutes: number | null;
  status: DayStatus;
  /** True when the clock ran past midnight — a night shift. */
  overnight: boolean;
}

export interface WeekResult {
  /** ISO date of the Monday that starts this week. */
  weekStart: string;
  employeeId: string;
  days: DayResult[];
  /** Sum of every readable day. */
  workedMinutes: number;
  targetMinutes: number;
  /** Worked hours counted against the weekly requirement. */
  normalMinutes: number;
  /** Daily excess that cancelled an earlier daily shortfall in the same week. */
  compensationMinutes: number;
  /** Daily excess left over once the week's requirement is met. */
  overtimeMinutes: number;
  /** How far short of the weekly requirement the week finished. */
  shortfallMinutes: number;
  /** worked − target: positive is surplus, negative is shortfall. */
  balanceMinutes: number;
  /** Days with a usable record. */
  daysWorked: number;
  /** Working days with no usable record. */
  daysMissing: number;
}

export interface MonthResult {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  employeeId: string;
  weeks: WeekResult[];
  workedMinutes: number;
  targetMinutes: number;
  normalMinutes: number;
  compensationMinutes: number;
  overtimeMinutes: number;
  shortfallMinutes: number;
  daysWorked: number;
  daysMissing: number;
}

/**
 * The plant's working-time rules.
 *
 * Deliberately one object rather than a settings screen: the policy is not
 * signed off yet, and the point of collecting it here is that changing it later
 * is a one-file edit rather than a hunt through the calculations.
 */
export interface AttendancePolicy {
  /** 48 hours. */
  weeklyTargetMinutes: number;
  /** 8 hours. */
  dailyTargetMinutes: number;
  /** Weekdays that carry the daily target. 1 = Monday … 6 = Saturday. */
  workingWeekdays: number[];
}
