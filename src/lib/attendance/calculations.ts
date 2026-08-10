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
  // A break longer than the shift is a data-entry error; it cannot take the
  // worked total below zero.
  const breakMinutes = Math.max(0, Math.min(entry.breakMinutes ?? 0, end - start));
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
