// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import type {
  Departure,
  Employee,
  PresenceStatus,
  TimesheetEntry,
} from "../../types/attendance.ts";

/**
 * What a departure means on a given date.
 *
 * Departures are entered ahead of time — a supervisor knows in March that
 * somebody leaves in May — so every question here is "as at a date" rather than
 * a stored flag somebody has to remember to flip. Nothing mutates: the same
 * departure row answers differently either side of its date, which is what makes
 * a person move to the Inactive list on the right morning with no scheduled job
 * to do it.
 *
 * Dates are ISO (YYYY-MM-DD), which compares correctly as a string.
 */

/**
 * One spelling for everything on the staff list.
 *
 * Names, staff numbers and designations are stored upper case because they
 * arrive from three places — typed in, imported, and whatever HR wrote — and
 * "Ahmed Shareef", "AHMED SHAREEF" and "ahmed shareef" being three different
 * people is the failure this prevents. Applied on the way in, so nothing has to
 * remember to do it on the way out.
 */
export function upper(value: string): string {
  return value.trim().toUpperCase();
}

/** Their exit, booked or already past. The earliest wins if there are two. */
export function exitOf(
  departures: Departure[],
  employeeId: string,
): Departure | undefined {
  return departures
    .filter((d) => d.type === "exit" && d.employeeId === employeeId)
    .sort((a, b) => a.from.localeCompare(b.from))[0];
}

/** Their last day is behind us, so they have left the plant. */
export function hasExited(
  departures: Departure[],
  employeeId: string,
  today: string,
): boolean {
  const exit = exitOf(departures, employeeId);
  return Boolean(exit) && today >= exit!.from;
}

/**
 * An exit is booked but has not come round yet.
 *
 * This is what highlights the row: the person is still staff and still on the
 * timesheet, and the highlight is the only warning that they are going.
 */
export function isLeaving(
  departures: Departure[],
  employeeId: string,
  today: string,
): boolean {
  const exit = exitOf(departures, employeeId);
  return Boolean(exit) && today < exit!.from;
}

/**
 * The spell away covering a date, if there is one. Exits are not spells away.
 *
 * A departure with no end date is open — somebody signed off sick without a
 * return date is still sick tomorrow.
 */
export function awayOn(
  departures: Departure[],
  employeeId: string,
  date: string,
): Departure | undefined {
  return departures.find(
    (d) =>
      d.employeeId === employeeId &&
      d.type !== "exit" &&
      date >= d.from &&
      (!d.to || date <= d.to),
  );
}

/**
 * A departure still in force, or still to come.
 *
 * An exit closes *on* the day it arrives, not after it: from that morning the
 * person has gone and it is a matter of record. That is the same boundary
 * `hasExited` and `isLeaving` use, and the three have to agree — a row that
 * counted as still open on the day somebody left would sit on the Status tab
 * naming a person no longer on the staff list.
 *
 * Everything else closes when its To date passes, and an open-ended spell never
 * closes on its own, which is what open-ended means.
 */
export function isOpenOn(departure: Departure, today: string): boolean {
  return departure.type === "exit"
    ? departure.from > today
    : !departure.to || departure.to >= today;
}

/** A departure is booked but has not started. Deliberately *not* highlighted. */
export function isBooked(
  departures: Departure[],
  employeeId: string,
  today: string,
): boolean {
  return departures.some(
    (d) => d.employeeId === employeeId && d.type !== "exit" && today < d.from,
  );
}

/**
 * Whether the row is called out in the staff list.
 *
 * Two very different things share the highlight, which is the point: it means
 * "this row is not the ordinary case, read it". A booked exit lights up the
 * moment it is entered, because the whole reason to record it early is so
 * everybody can see it coming. A booked spell away stays quiet until its start
 * date arrives, because knowing somebody is off in six weeks is not something a
 * supervisor needs shouted at them every morning until then.
 */
export function isHighlighted(
  departures: Departure[],
  employeeId: string,
  today: string,
): boolean {
  return (
    isLeaving(departures, employeeId, today) ||
    Boolean(awayOn(departures, employeeId, today))
  );
}

/**
 * Where somebody stands today.
 *
 * On site is the *default*, not something to be earned by clocking in. Being
 * away is the exceptional case and the case somebody has to write down, so the
 * four statuses are read off what has been recorded against a person: an exit,
 * a booked spell away, or a day the timesheet has already marked as leave.
 * Anybody with none of those is at work.
 *
 * Off site in particular is a booked state — it is one of the departure types,
 * with its own From and To — and not an inference from an empty timesheet.
 * Deriving it from a missing clock-in instead would mean a staff list imported
 * at nine in the morning showed the whole plant as off site, and would flip
 * everybody back to off site each evening as they clocked out.
 *
 * A pending exit deliberately has no effect here. Somebody working out their
 * notice is on site like anybody else, and saying otherwise would misreport who
 * is actually at the plant. The highlighted row carries that news instead.
 */
export function presenceOf(
  employee: Employee,
  departures: Departure[],
  entry: TimesheetEntry | undefined,
  today: string,
): PresenceStatus {
  if (hasExited(departures, employee.id, today)) return "off-site";

  const away = awayOn(departures, employee.id, today);
  if (away) return away.type as PresenceStatus;

  // A day already marked as leave on the timesheet shows as that, so the staff
  // list and the day's sheet never contradict each other.
  if (entry?.status === "sick") return "sick";
  if (entry?.status === "vacation") return "vacation";

  return "on-site";
}

/** On the books today: their last day has not passed. */
export function isCurrentStaff(
  departures: Departure[],
  employeeId: string,
  today: string,
): boolean {
  return !hasExited(departures, employeeId, today);
}

/**
 * Whether somebody belongs on the timesheet for a given date.
 *
 * Past dates keep everyone who was employed then, which is what stops an exit
 * from quietly rewriting history: the week somebody worked before they left
 * still shows them and still totals correctly. Only the sheets from their last
 * day onwards drop them.
 */
export function wasEmployedOn(
  departures: Departure[],
  employeeId: string,
  date: string,
): boolean {
  const exit = exitOf(departures, employeeId);
  return !exit || date < exit.from;
}

/**
 * Turn a presence read off an imported file into a departure, or nothing.
 *
 * A file says where somebody is *now*, not the dates either side of it, so the
 * spell it creates is open-ended and starts today. Somebody on site has no
 * departure at all, which is why this returns undefined rather than a row.
 */
export function departureFromPresence(
  employeeId: string,
  presence: PresenceStatus,
  today: string,
  id: string,
): Departure | undefined {
  if (presence === "on-site") return undefined;
  return { id, employeeId, type: presence, from: today };
}
