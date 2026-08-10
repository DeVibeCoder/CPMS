import type {
  AttendancePolicy,
  AttendanceRecord,
  DayResult,
  DayStatus,
  MonthResult,
  WeekResult,
} from "../../types/attendance.ts";

/**
 * Attendance calculation engine.
 *
 * Self-contained on purpose: it imports nothing but types, so it can be run
 * straight under Node for testing (`npm run test:attendance`) as well as
 * bundled into the app. Nothing here touches React, storage or a backend.
 *
 * Everything is computed in whole minutes. Times arrive as "HH:mm" strings and
 * are converted once, at the edge — arithmetic on time strings is how "09:60"
 * and similar nonsense gets into a payroll report.
 */

// -----------------------------------------------------------------------------
// Policy
// -----------------------------------------------------------------------------

/**
 * The plant's stated rules: 48 hours a week, 8 hours a day, Monday to Saturday.
 *
 * These are the numbers to change when the final CPM policy is confirmed. Note
 * that six working days at eight hours is exactly the weekly target, which is
 * what lets the weekly figures below reconcile without double counting.
 */
export const DEFAULT_POLICY: AttendancePolicy = {
  weeklyTargetMinutes: 48 * 60,
  dailyTargetMinutes: 8 * 60,
  workingWeekdays: [1, 2, 3, 4, 5, 6], // Monday–Saturday
};

// -----------------------------------------------------------------------------
// Time
// -----------------------------------------------------------------------------

/** Minutes since midnight, or null when the value is absent or malformed. */
export function parseTime(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "8h 00m". The unit suffixes stay so a column of them cannot be misread. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const sign = minutes < 0 ? "-" : "";
  const total = Math.abs(Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

/** Same as `formatDuration` but with an explicit + on a surplus. */
export function formatSigned(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes === 0) return "0h 00m";
  return (minutes > 0 ? "+" : "") + formatDuration(minutes);
}

/** Decimal hours, for export and for charts. Two places is plenty. */
export function toHours(minutes: number | null | undefined): number {
  if (minutes === null || minutes === undefined) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------
// Dates are handled as plain YYYY-MM-DD strings built in UTC. Using the local
// timezone here would shift a day either side of midnight depending on where
// the browser happens to be, which is exactly the class of bug that makes an
// attendance sheet disagree with itself.

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** The Monday on or before the given date. Weeks run Monday–Sunday. */
export function startOfWeek(iso: string): string {
  const weekday = weekdayOf(iso);
  // Sunday (0) belongs to the week that began six days earlier, not the one
  // starting tomorrow.
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(iso, offset);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** The seven dates of the week containing `iso`, Monday first. */
export function weekDates(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// -----------------------------------------------------------------------------
// A single day
// -----------------------------------------------------------------------------

/**
 * Minutes of break that fall inside the shift.
 *
 * Clamped to the shift rather than taken at face value: a break recorded
 * outside the clocked hours is a data-entry error, and subtracting it would
 * quietly remove time the person actually worked.
 */
function breakWithinShift(
  start: number | null,
  end: number | null,
  shiftStart: number,
  shiftEnd: number,
): number {
  if (start === null || end === null) return 0;
  // A break that runs past midnight is measured on the same shifted clock.
  const breakEnd = end < start ? end + 24 * 60 : end;
  const from = Math.max(start, shiftStart);
  const to = Math.min(breakEnd, shiftEnd);
  return Math.max(0, to - from);
}

export interface DayInput {
  date: string;
  record?: AttendanceRecord;
  policy?: AttendancePolicy;
}

/**
 * Work out one day.
 *
 * A day with no usable in/out pair yields `workedMinutes: null`, never 0 — the
 * caller has to decide what an unrecorded day means, and treating it as zero
 * here would hide a missing timesheet inside a shortfall.
 */
export function calculateDay({ date, record, policy = DEFAULT_POLICY }: DayInput): DayResult {
  const weekday = weekdayOf(date);
  const isWorkingDay = policy.workingWeekdays.includes(weekday);
  const targetMinutes = isWorkingDay ? policy.dailyTargetMinutes : 0;

  const timeIn = parseTime(record?.timeIn);
  const rawOut = parseTime(record?.timeOut);

  if (timeIn === null || rawOut === null) {
    const status: DayStatus = !isWorkingDay ? "off" : record ? "missing" : "rest";
    return {
      date,
      weekday,
      record,
      workedMinutes: null,
      breakMinutes: 0,
      targetMinutes,
      differenceMinutes: null,
      status,
      overnight: false,
    };
  }

  // A shift ending before it started ran through midnight — the plant works
  // nights, so this is ordinary rather than an error.
  const overnight = rawOut < timeIn;
  const shiftEnd = overnight ? rawOut + 24 * 60 : rawOut;

  const breakMinutes = breakWithinShift(
    parseTime(record?.breakStart),
    parseTime(record?.breakEnd),
    timeIn,
    shiftEnd,
  );

  const workedMinutes = Math.max(0, shiftEnd - timeIn - breakMinutes);
  const differenceMinutes = workedMinutes - targetMinutes;

  let status: DayStatus;
  if (!isWorkingDay) status = workedMinutes > 0 ? "extra" : "off";
  else if (differenceMinutes > 0) status = "extra";
  else if (differenceMinutes < 0) status = "short";
  else status = "normal";

  return {
    date,
    weekday,
    record,
    workedMinutes,
    breakMinutes,
    targetMinutes,
    differenceMinutes,
    status,
    overnight,
  };
}

// -----------------------------------------------------------------------------
// A week
// -----------------------------------------------------------------------------

/**
 * Work out one week, Monday to Sunday.
 *
 * The rule the plant asked for: a day over eight hours is not automatically
 * overtime, because the plant releases people early for weather and expects the
 * hours back later in the same week. So the week is settled as a whole.
 *
 * Three figures come out of it, and they do not overlap:
 *
 *   compensation — daily excess that cancelled an earlier daily shortfall
 *   overtime     — daily excess left once the 48 hours are met
 *   shortfall    — how far under 48 hours the week finished
 *
 * They reconcile by construction. Writing E for the total daily excess and S
 * for the total daily shortfall:
 *
 *   compensation = min(E, S)
 *   overtime     = E − compensation
 *   shortfall    = S − compensation
 *
 * and because the six daily targets add up to exactly the weekly target,
 * E − S is the same number as worked − 48 hours. So the daily view and the
 * weekly view always agree, and no minute is counted twice.
 */
export function calculateWeek(
  employeeId: string,
  anyDateInWeek: string,
  records: AttendanceRecord[],
  policy: AttendancePolicy = DEFAULT_POLICY,
): WeekResult {
  const dates = weekDates(anyDateInWeek);
  const byDate = new Map(records.map((r) => [r.date, r]));

  const days = dates.map((date) =>
    calculateDay({ date, record: byDate.get(date), policy }),
  );

  let workedMinutes = 0;
  let dailyExcess = 0;
  let dailyShortfall = 0;
  let daysWorked = 0;
  let daysMissing = 0;

  for (const day of days) {
    if (day.workedMinutes === null) {
      // An unrecorded working day is still eight hours owed. It shows up as
      // shortfall, and separately as a missing day, so a payroll figure can
      // never quietly absorb a timesheet nobody filled in.
      if (day.targetMinutes > 0) {
        dailyShortfall += day.targetMinutes;
        daysMissing += 1;
      }
      continue;
    }
    workedMinutes += day.workedMinutes;
    daysWorked += 1;
    const difference = day.workedMinutes - day.targetMinutes;
    if (difference > 0) dailyExcess += difference;
    else dailyShortfall += -difference;
  }

  const compensationMinutes = Math.min(dailyExcess, dailyShortfall);
  const overtimeMinutes = dailyExcess - compensationMinutes;
  const shortfallMinutes = dailyShortfall - compensationMinutes;

  const targetMinutes = policy.weeklyTargetMinutes;
  // Hours that count towards the requirement, never more than the requirement.
  const normalMinutes = Math.min(workedMinutes, targetMinutes);

  return {
    weekStart: dates[0],
    employeeId,
    days,
    workedMinutes,
    targetMinutes,
    normalMinutes,
    compensationMinutes,
    overtimeMinutes,
    shortfallMinutes,
    balanceMinutes: workedMinutes - targetMinutes,
    daysWorked,
    daysMissing,
  };
}

// -----------------------------------------------------------------------------
// A month
// -----------------------------------------------------------------------------

/**
 * Roll weeks up into a month.
 *
 * A month is made of the weeks that *begin* in it, not the days that fall in
 * it. Overtime is a weekly result, so splitting a week across two months would
 * either double-count the surplus or lose it. Whole weeks keep the arithmetic
 * honest at the cost of a few days either side of the boundary — a trade worth
 * revisiting when the plant confirms how it wants month-end handled.
 */
export function calculateMonth(
  employeeId: string,
  monthIso: string,
  records: AttendanceRecord[],
  policy: AttendancePolicy = DEFAULT_POLICY,
): MonthResult {
  const month = startOfMonth(monthIso);
  const monthKey = month.slice(0, 7);

  // Every Monday whose own month is this one.
  const weekStarts: string[] = [];
  let cursor = startOfWeek(month);
  // Walk at most six weeks forward; no month spans more.
  for (let i = 0; i < 7; i++) {
    if (cursor.slice(0, 7) === monthKey) weekStarts.push(cursor);
    cursor = addDays(cursor, 7);
    if (cursor.slice(0, 7) > monthKey) break;
  }

  const weeks = weekStarts.map((start) =>
    calculateWeek(employeeId, start, records, policy),
  );

  const sum = (pick: (w: WeekResult) => number) =>
    weeks.reduce((total, week) => total + pick(week), 0);

  return {
    month,
    employeeId,
    weeks,
    workedMinutes: sum((w) => w.workedMinutes),
    targetMinutes: sum((w) => w.targetMinutes),
    normalMinutes: sum((w) => w.normalMinutes),
    compensationMinutes: sum((w) => w.compensationMinutes),
    overtimeMinutes: sum((w) => w.overtimeMinutes),
    shortfallMinutes: sum((w) => w.shortfallMinutes),
    daysWorked: sum((w) => w.daysWorked),
    daysMissing: sum((w) => w.daysMissing),
  };
}
