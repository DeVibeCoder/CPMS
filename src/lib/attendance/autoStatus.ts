// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import type {
  AttendanceStatus,
  Departure,
  TimesheetEntry,
} from "../../types/attendance.ts";
import { awayOn } from "./staff.ts";

/**
 * Keeping the timesheet in step with what the Status tab says.
 *
 * A supervisor records a vacation once, weeks ahead. From that moment the staff
 * list, the org chart and every timesheet row inside the range have to agree
 * with it — and they have to agree *both ways*, because a departure entered
 * against the wrong person or the wrong week gets deleted, and a sheet still
 * showing that vacation afterwards is a sheet nobody can trust.
 *
 * The staff list and the chart are easy: they read the departures directly and
 * are therefore never stale. The timesheet is not, because it stores rows — the
 * master sheet and every total read those rows, so a day that merely *looked*
 * like a vacation on screen would still be counted as a worked day everywhere
 * else. So the rows are written, and the `auto` flag records that a departure
 * wrote them.
 *
 * The `auto` flag records which rows exist only because of a booking, so that
 * withdrawing one can take its rows away again without touching a day somebody
 * actually worked and wrote down.
 */

/** The status a booked departure forces on a day, or null if none is booked. */
export function bookedStatus(
  departures: Departure[],
  employeeId: string,
  date: string,
): AttendanceStatus | null {
  const away = awayOn(departures, employeeId, date);
  // Exits are not spells away, so `awayOn` never returns one — a day after
  // somebody leaves has no row at all rather than a row with a status.
  return away ? (away.type as AttendanceStatus) : null;
}

/**
 * What should happen to one row.
 *
 * Three outcomes rather than a returned row, because "leave it alone" and
 * "there should be no row here" are both real answers and neither is a
 * `TimesheetEntry`.
 */
export type Reconciliation =
  | { action: "keep" }
  | { action: "write"; entry: TimesheetEntry }
  | { action: "delete" };

const KEEP: Reconciliation = { action: "keep" };

/**
 * Bring one row into line with what is booked against that person that day.
 *
 * The booking is the only thing that decides a day's status. There is no way to
 * say otherwise on the timesheet — the column shows what the Status tab says and
 * nothing else — so this runs in both directions and always wins.
 *
 * Booked: the row says so, with no times on it. A vacation day has no hours, and
 * leaving a stale clock-in behind would put them into the totals.
 *
 * Not booked: the day is an ordinary working day, whatever the row used to say.
 * A status with no booking behind it can only be left over — from a booking
 * since withdrawn, or from a sheet written when the timesheet still had a status
 * dropdown on it — and with the dropdown gone there is nowhere left to correct
 * one by hand. So it is corrected here.
 *
 * A row that exists *only* because of a booking is deleted rather than reset to
 * Present. An empty Present row reads as a day nobody has filled in and would
 * hold up the day's sign-off. One carrying times or a remark is kept: that part
 * is somebody's own work, and only the status was ever ours.
 */
export function reconcileEntry(
  entry: TimesheetEntry | undefined,
  departures: Departure[],
  employeeId: string,
  date: string,
): Reconciliation {
  const wanted = bookedStatus(departures, employeeId, date);

  if (wanted) {
    const settled =
      entry?.auto === true &&
      entry.status === wanted &&
      !entry.start &&
      !entry.end &&
      !entry.breaks?.length;
    if (settled) return KEEP;
    return {
      action: "write",
      entry: {
        employeeId,
        date,
        status: wanted,
        // Whatever a clerk wrote about the day survives the status change.
        ...(entry?.remarks ? { remarks: entry.remarks } : {}),
        auto: true,
      },
    };
  }

  if (!entry) return KEEP;

  const written = Boolean(
    entry.start || entry.end || entry.breaks?.length || entry.remarks?.trim(),
  );
  if (entry.auto && !written) return { action: "delete" };
  if (entry.status === "present" && !entry.auto) return KEEP;
  return {
    action: "write",
    entry: { ...entry, status: "present", auto: undefined },
  };
}

/** The map key a timesheet row is stored under. One person, one day. */
export const entryKey = (employeeId: string, date: string) =>
  `${employeeId}|${date}`;

/**
 * Reconcile a whole set of rows against the departures.
 *
 * Returns the same map when nothing changed, so a React state setter can hand
 * the identical reference straight back and not re-render. Completed days are
 * skipped: a signed-off sheet is a record, and a departure entered afterwards
 * does not get to rewrite it — reopen the day to do that.
 */
export function reconcileEntries(
  entries: Map<string, TimesheetEntry>,
  departures: Departure[],
  isSubmitted: (date: string) => boolean,
): Map<string, TimesheetEntry> {
  let next: Map<string, TimesheetEntry> | null = null;

  for (const [key, entry] of entries) {
    if (isSubmitted(entry.date)) continue;
    const result = reconcileEntry(entry, departures, entry.employeeId, entry.date);
    if (result.action === "keep") continue;
    next ??= new Map(entries);
    if (result.action === "delete") next.delete(key);
    else next.set(key, result.entry);
  }

  return next ?? entries;
}
