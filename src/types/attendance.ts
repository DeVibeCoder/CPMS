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
  /** Plant staff number, whatever form the plant writes it in. */
  id: string;
  name: string;
  department: string;
  position: string;
  /**
   * Invented staff from `src/data/attendance`.
   *
   * They are on every list a real person is on — the module ships with a plant
   * already in it so each screen can be checked against something before a real
   * name is loaded. The flag is what "Reset to sample" restores them from, and
   * what tells anybody reading a row that it is not a person.
   */
  sample?: boolean;
}

/**
 * The four ways somebody is away, and the one column that records them.
 *
 * Vacation, sick and off site are spells with two ends — they start and they
 * finish. An exit has only a start, because there is no coming back from it.
 * They are one type rather than two because a supervisor entering any of them
 * is doing the same thing: writing down a date somebody will not be at work.
 */
export type DepartureType = "vacation" | "sick" | "off-site" | "exit";

export const DEPARTURE_TYPES: {
  value: DepartureType;
  label: string;
  /** An exit is one-way, so it has no return date. */
  ranged: boolean;
}[] = [
  { value: "vacation", label: "Vacation", ranged: true },
  { value: "sick", label: "Sick", ranged: true },
  { value: "off-site", label: "Off site", ranged: true },
  { value: "exit", label: "Exit", ranged: false },
];

export const DEPARTURE_LABELS: Record<DepartureType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  "off-site": "Off site",
  exit: "Exit",
};

/**
 * One spell away, entered before it starts.
 *
 * Held apart from the timesheet because it is written weeks ahead, when the
 * timesheet rows for those days do not exist yet.
 */
export interface Departure {
  /** Local row id. Departures are edited and deleted as rows, not by key. */
  id: string;
  employeeId: string;
  type: DepartureType;
  /** ISO date it starts. For an exit, their last day. */
  from: string;
  /** ISO date it ends, inclusive. Never set for an exit; optional otherwise. */
  to?: string;
}

/**
 * Why somebody is not on the clock. Present is the ordinary case.
 *
 * Never chosen: a day's status is derived from what is booked against the person
 * on the Status tab, and the timesheet has no control that can disagree with it.
 * See `lib/attendance/autoStatus.ts`.
 */
export type AttendanceStatus = "present" | "sick" | "vacation" | "off-site";

/**
 * A gap in the day, as two clock times.
 *
 * Timed rather than a total in minutes, because the plant's gaps are not all
 * the lunch break. When production stops for rain the crew is sent off and
 * called back when it clears, so a day can carry two or three gaps and what
 * matters is *when* — a crew released at 13:00 and back at 15:00 is a different
 * day from one that took two hours at lunch, even though both lose 120 minutes.
 */
export interface TimeBreak {
  /** "HH:mm", 24-hour. */
  from: string;
  to: string;
  /** Why the gap. Blank for the ordinary break; "RAIN" for a release. */
  reason?: string;
}

/**
 * Where somebody stands right now, which is what the staff list shows.
 *
 * Not the same thing as `AttendanceStatus`: that records what a *day* was, after
 * the fact, on a timesheet. This is read off today's row and today's departures,
 * and answers "is this person at the plant" rather than "how should this day be
 * counted".
 */
export type PresenceStatus = "on-site" | "off-site" | "sick" | "vacation";

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  "on-site": "On site",
  "off-site": "Off site",
  sick: "Sick",
  vacation: "Vacation",
};

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
  /** Every gap in the day, in the order they happened. */
  breaks?: TimeBreak[];
  end?: string;
  status: AttendanceStatus;
  remarks?: string;
  /**
   * Written from a booked departure rather than typed by a clerk.
   *
   * The flag is what lets a cancelled departure undo itself. Without it there
   * is no way to tell a vacation row the Status tab wrote from one somebody set
   * by hand on the timesheet, so removing the departure would either leave a
   * stale vacation behind or wipe out a deliberate entry. See
   * `lib/attendance/autoStatus.ts`.
   */
  auto?: boolean;
}

/** A day's entry with its arithmetic worked out. */
export interface EntryTotals {
  /** Minutes worked, or null when the times cannot be read. */
  workedMinutes: number | null;
  /** Minutes beyond the daily target. */
  overtimeMinutes: number;
}
