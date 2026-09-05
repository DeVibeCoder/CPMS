import type { EntryTotals, TimesheetEntry } from "../../types/attendance.ts";

/**
 * Attendance time arithmetic.
 *
 * Self-contained on purpose: it imports nothing but types, so Node can run this
 * exact file for the tests (`npm run test:attendance`) as well as Vite bundling
 * it. Nothing here touches React, storage or a backend.
 *
 * Everything is whole minutes. Times arrive as "HH:mm" and are converted once,
 * at the edge — arithmetic on time strings is how "09:60" reaches a payroll
 * sheet.
 */

/** Hours in a normal working day. Anything beyond it counts as overtime. */
export const DAILY_TARGET_MINUTES = 8 * 60;

// -----------------------------------------------------------------------------
// Time
// -----------------------------------------------------------------------------

/** Minutes since midnight, or null when absent or malformed. */
export function parseTime(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "8h 00m". Unit suffixes stay so a column of them cannot be misread. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const sign = minutes < 0 ? "-" : "";
  const total = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

/** Compact form for a dense grid: "8:00". */
export function formatShort(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const total = Math.abs(Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------
// Plain YYYY-MM-DD strings built in UTC. Using the local timezone would shift a
// day either side of midnight depending on where the browser is, which is the
// class of bug that makes a timesheet disagree with itself.

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/**
 * How many days a range covers, counting both ends.
 *
 * Inclusive because that is what a spell away means to the person taking it:
 * somebody off from Monday to Friday is off for five days, not four. The same
 * arithmetic done exclusively is the reason a week's vacation gets approved as
 * six days somewhere and reported as five somewhere else.
 *
 * Both dates are parsed in UTC, so no daylight-saving change can make a range
 * come out a day short.
 */
export function daysInclusive(from: string, to: string): number {
  const span = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.floor(span / 86_400_000) + 1;
}

/**
 * A date the way the plant writes it: 25/12/2026.
 *
 * ISO is what gets stored, sorted and compared — it is the only form that does
 * all three correctly — but it is not the form anybody here reads a date in, and
 * a sheet that shows one thing and is typed in another is a sheet people make
 * mistakes on.
 */
export function formatDayMonthYear(iso: string): string {
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

/**
 * Read a date somebody typed, in the order they think in.
 *
 * The separator is not fussed over — any run of non-digits divides the three
 * parts — because a keypad has a full stop on it and a keyboard has a slash, and
 * insisting on one of them only creates a field that rejects a date it plainly
 * understood.
 *
 * Deliberately not `<input type="date">`, for the reason `TimeField` is not
 * `<input type="time">`: that control renders in the machine's locale, so the
 * same field reads 03-12 to one clerk and 12-03 to the next, and neither is
 * warned which they are looking at. Between a day in March and a day in December
 * that is not a cosmetic difference.
 *
 * So 25/12/2026, 25-12-2026 and 25.12.2026 are all read, and 2512026 is not —
 * a date that cannot be read comes back null rather than being rounded into a
 * real one, because a typo has to stay visible instead of quietly becoming a
 * different day.
 */
export function parseDayMonthYear(raw: string): string | null {
  const parts = raw.trim().split(/[^\d]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  if (day.length > 2 || month.length > 2 || year.length !== 4) return null;

  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  // Round-tripping catches the days that do not exist: 31-02 parses as a date
  // and comes back as 03-03, which is not the day anybody meant.
  const date = parseISODate(iso);
  return Number.isNaN(date.getTime()) || toISODate(date) !== iso ? null : iso;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** The Monday on or before the date. Weeks run Monday–Sunday. */
export function startOfWeek(iso: string): string {
  const weekday = weekdayOf(iso);
  // Sunday belongs to the week that began six days earlier, not tomorrow's.
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Every date of the week containing `iso`, Monday first. */
export function weekDates(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Every date of the month containing `iso`. */
export function monthDates(iso: string): string[] {
  const first = startOfMonth(iso);
  const dates: string[] = [];
  let cursor = first;
  while (cursor.slice(0, 7) === first.slice(0, 7)) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

// -----------------------------------------------------------------------------
// One entry
// -----------------------------------------------------------------------------

/**
 * Work out a day.
 *
 * The break is a duration and is always removed from the worked total — it is
 * never time on the clock. A shift whose end reads earlier than its start ran
 * through midnight, which is ordinary on a plant that works nights.
 *
 * A day without a readable start and end yields `null`, never 0. Sick and
 * vacation days are 0 by rule rather than by absence of data, and the two need
 * to stay distinguishable.
 */
/**
 * How long a day's gaps ran, in minutes.
 *
 * Every time is placed on the same day-line as the shift start before it is
 * measured, so a break on a night shift that runs past midnight — clock out
 * 23:30, back 00:15 — comes out as 45 minutes rather than as a negative number
 * that would silently add time to the day.
 */
/**
 * Read the shorthand a clerk types into a time field.
 *
 * The timesheet does not use `<input type="time">`: that renders in the
 * machine's locale, which here means a 12-hour field with an AM/PM segment and
 * a clock icon — three things to tab through to enter a number somebody already
 * knows. A plant works in 24-hour time and somebody filling thirty rows wants to
 * type "0700" and move on.
 *
 * So all of 7, 700, 0700, 7:00 and 07.00 are accepted and normalised to HH:mm.
 * Anything that is not a time returns null rather than being rounded into one —
 * a typo has to stay visible instead of quietly becoming midnight.
 */
export function parseTyped(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d]/g, "");
  if (!digits || digits.length > 4) return null;

  const hours = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, -2));
  const minutes = digits.length <= 2 ? 0 : Number(digits.slice(-2));

  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function breakTotal(entry: TimesheetEntry | undefined): number {
  const start = parseTime(entry?.start);
  if (!entry?.breaks?.length || start === null) return 0;

  let total = 0;
  for (const gap of entry.breaks) {
    const rawFrom = parseTime(gap.from);
    const rawTo = parseTime(gap.to);
    if (rawFrom === null || rawTo === null) continue;

    const from = rawFrom < start ? rawFrom + 24 * 60 : rawFrom;
    const to = rawTo < start ? rawTo + 24 * 60 : rawTo;
    total += Math.max(0, (to < from ? to + 24 * 60 : to) - from);
  }
  return total;
}

export function calculateEntry(entry: TimesheetEntry | undefined): EntryTotals {
  if (!entry || entry.status !== "present") {
    return { workedMinutes: entry ? 0 : null, overtimeMinutes: 0 };
  }

  const start = parseTime(entry.start);
  const rawEnd = parseTime(entry.end);
  if (start === null || rawEnd === null) {
    return { workedMinutes: null, overtimeMinutes: 0 };
  }

  const end = rawEnd < start ? rawEnd + 24 * 60 : rawEnd;
  // Breaks longer than the shift are a data-entry error; they cannot take the
  // worked total below zero.
  const breakMinutes = Math.max(0, Math.min(breakTotal(entry), end - start));
  const workedMinutes = end - start - breakMinutes;

  return {
    workedMinutes,
    overtimeMinutes: Math.max(0, workedMinutes - DAILY_TARGET_MINUTES),
  };
}

/** Totals for a set of entries — a person's week, or a day's whole crew. */
export function sumEntries(entries: (TimesheetEntry | undefined)[]): {
  workedMinutes: number;
  overtimeMinutes: number;
  daysPresent: number;
} {
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let daysPresent = 0;

  for (const entry of entries) {
    const totals = calculateEntry(entry);
    if (totals.workedMinutes === null) continue;
    workedMinutes += totals.workedMinutes;
    overtimeMinutes += totals.overtimeMinutes;
    if (entry?.status === "present" && totals.workedMinutes > 0) daysPresent += 1;
  }

  return { workedMinutes, overtimeMinutes, daysPresent };
}
