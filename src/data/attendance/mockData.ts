import type {
  Departure,
  Employee,
  TimeBreak,
  TimesheetEntry,
} from "@/types/attendance";
// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. The type-only import above is erased, so it may use it.
import { addDays, startOfWeek, toISODate } from "../../lib/attendance/calculations.ts";
import { reconcileEntry } from "../../lib/attendance/autoStatus.ts";
import { exitOf } from "../../lib/attendance/staff.ts";

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

const PLANT = "CEMENT PLANT";
const ADMIN = "ADMINISTRATION";

/** The plant's ordinary midday break, and the office's shorter one. */
const LUNCH: TimeBreak = { from: "12:00", to: "13:00", reason: "LUNCH" };
const SHORT_LUNCH: TimeBreak = { from: "12:30", to: "13:00", reason: "LUNCH" };
/** The night crew's break falls the other side of midnight, on purpose. */
const NIGHT_BREAK: TimeBreak = { from: "23:30", to: "00:30", reason: "BREAK" };

/**
 * The shifts the plant runs, rather than one line per person.
 *
 * Thirty-odd people working a handful of shift patterns is a handful of
 * patterns, not thirty: writing each out separately would be thirty places for
 * the lunch hour to drift apart.
 */
const SHIFTS = {
  day: { start: "07:00", end: "16:00", lunch: LUNCH },
  long: { start: "07:00", end: "18:00", lunch: LUNCH },
  night: { start: "19:00", end: "04:00", lunch: NIGHT_BREAK },
  office: { start: "08:00", end: "17:00", lunch: SHORT_LUNCH },
  /** The store's shorter day — under the eight-hour target, which is the case
      the overtime column has to be able to *not* fire on. */
  store: { start: "08:00", end: "16:00", lunch: SHORT_LUNCH },
} as const;

type ShiftName = keyof typeof SHIFTS;

interface SampleStaff {
  id: string;
  name: string;
  position: string;
  /** Defaults to the plant; only the office people say otherwise. */
  department?: string;
  /** The org chart post they hold, if any. Not everybody is on the chart. */
  slot?: string;
  /** Defaults to the ordinary day shift. */
  shift?: ShiftName;
  /**
   * Days that did not go to plan, keyed by how many *working* days back they
   * fall. See `buildEntries` for why working days rather than calendar days.
   */
  exceptions?: Record<number, Partial<TimesheetEntry>>;
}

/**
 * The invented plant.
 *
 * Sized to the org chart on purpose: thirty-two of the chart's thirty-three
 * posts are filled, so the manpower summary reads like a real establishment
 * with a real hole in it rather than a page of empty boxes. Plant-3's assistant
 * plant operator is the vacancy, which is where it is on the plant's own paper
 * chart.
 *
 * Three people are deliberately off the chart — the two office staff and the
 * lab technician — because the chart is the production establishment and not
 * the payroll.
 */
const SAMPLE_STAFF: SampleStaff[] = [
  {
    id: "CP001",
    name: "AHMED SHAREEF",
    position: "OPERATION MANAGER",
    slot: "manager",
    shift: "office",
  },
  {
    id: "CP002",
    name: "MOHAMED ISMAIL",
    position: "SUPERVISOR",
    slot: "sup-dispatch",
    shift: "long",
    exceptions: { 3: { end: "20:00", remarks: "VESSEL DISCHARGE" } },
  },
  {
    id: "CP003",
    name: "HASSAN ALI",
    position: "SUPERVISOR",
    slot: "sup-production",
    shift: "long",
  },
  {
    id: "CP004",
    name: "IBRAHIM NAZEER",
    position: "DISPATCH OFFICER",
    slot: "dispatch-officer",
  },

  // Logistics — seven vehicle operators.
  { id: "CP005", name: "ADAM RIYAZ", position: "HEAVY VEHICLE OPERATOR", slot: "hv-1" },
  {
    id: "CP006",
    name: "ALI WAHEED",
    position: "HEAVY VEHICLE OPERATOR",
    slot: "hv-2",
    exceptions: { 6: { end: undefined, remarks: "NO CLOCK-OUT RECORDED" } },
  },
  { id: "CP007", name: "YOOSUF NASEEM", position: "HEAVY VEHICLE OPERATOR", slot: "hv-3" },
  { id: "CP008", name: "HUSSAIN RASHEED", position: "FORKLIFT OPERATOR", slot: "fl-1" },
  { id: "CP009", name: "ABDULLA SHAKIR", position: "FORKLIFT OPERATOR", slot: "fl-2" },
  { id: "CP010", name: "MOOSA LATHEEF", position: "FORKLIFT OPERATOR", slot: "fl-3" },
  { id: "CP011", name: "AHMED NIYAZ", position: "PICKUP OPERATOR", slot: "pickup-1" },

  // Loading team.
  { id: "CP012", name: "IBRAHIM FAISAL", position: "SENIOR ASSISTANT", slot: "load-senior" },
  { id: "CP013", name: "HASSAN SHIYAM", position: "ASSISTANT", slot: "load-1" },
  { id: "CP014", name: "MOHAMED ZAHIR", position: "ASSISTANT", slot: "load-2" },
  { id: "CP015", name: "ALI MUNAWWAR", position: "ASSISTANT", slot: "load-3" },

  // Plant-1.
  {
    id: "CP016",
    name: "AHMED FAZEEL",
    position: "PLANT OPERATOR",
    slot: "p1-operator",
    shift: "long",
    exceptions: { 2: { end: "20:00", remarks: "BREAKDOWN — PACKING LINE" } },
  },
  {
    id: "CP017",
    name: "ABDULLA NASEER",
    position: "ASSISTANT PLANT OPERATOR",
    slot: "p1-assistant-operator",
  },
  { id: "CP018", name: "HUSSAIN ADHIL", position: "ASSISTANT", slot: "p1-asst-1" },
  {
    id: "CP019",
    name: "MOHAMED SAMAH",
    position: "ASSISTANT",
    slot: "p1-asst-2",
    exceptions: {
      // The day this module's break handling exists for: production stopped
      // for weather, the crew went off at 13:00 and came back at 15:00.
      2: {
        end: "18:00",
        breaks: [LUNCH, { from: "13:00", to: "15:00", reason: "RAIN — NO PRODUCTION" }],
        remarks: "RELEASED FOR RAIN, BACK AT 1500",
      },
    },
  },
  {
    id: "CP020",
    name: "IBRAHIM RASHEED",
    position: "ASSISTANT",
    slot: "p1-asst-3",
    exceptions: {
      2: {
        end: "18:00",
        breaks: [LUNCH, { from: "13:00", to: "15:00", reason: "RAIN — NO PRODUCTION" }],
        remarks: "RELEASED FOR RAIN, BACK AT 1500",
      },
      // A sick day recorded straight on the timesheet, with no departure behind
      // it. Ordinary, and the row the auto-status rule must never touch.
      5: { status: "sick", start: undefined, end: undefined, breaks: undefined },
    },
  },
  { id: "CP021", name: "ALI SHAMEEM", position: "ASSISTANT", slot: "p1-asst-4" },

  // Plant-2.
  {
    id: "CP022",
    name: "AHMED IHUSAAN",
    position: "PLANT OPERATOR",
    slot: "p2-operator",
    shift: "long",
  },
  {
    id: "CP023",
    name: "HASSAN WAHEED",
    position: "ASSISTANT PLANT OPERATOR",
    slot: "p2-assistant-operator",
  },
  { id: "CP024", name: "MOHAMED AFRAH", position: "ASSISTANT", slot: "p2-asst-1" },
  { id: "CP025", name: "ABDULLA JUNAID", position: "ASSISTANT", slot: "p2-asst-2" },
  { id: "CP026", name: "IBRAHIM SHAFAU", position: "ASSISTANT", slot: "p2-asst-3" },
  { id: "CP027", name: "ALI NAZIM", position: "ASSISTANT", slot: "p2-asst-4" },

  // Plant-3. Its assistant plant operator post is the chart's one vacancy.
  {
    id: "CP028",
    name: "AHMED SIYAM",
    position: "PLANT OPERATOR",
    slot: "p3-operator",
    shift: "long",
  },
  { id: "CP029", name: "MOOSA IRUFAAN", position: "ASSISTANT", slot: "p3-asst-1" },
  { id: "CP030", name: "HUSSAIN MUAZ", position: "ASSISTANT", slot: "p3-asst-2" },
  {
    id: "CP031",
    name: "MOHAMED NIZAR",
    position: "ASSISTANT",
    slot: "p3-asst-3",
    shift: "night",
    exceptions: { 1: { remarks: "NIGHT SHIFT — KILN WATCH" } },
  },
  { id: "CP032", name: "ABDULLA RAMEEZ", position: "ASSISTANT", slot: "p3-asst-4" },

  // Off the chart: the office, and the lab.
  {
    id: "CP033",
    name: "FATHIMATH MARIYAM",
    position: "ADMIN ASSISTANT",
    department: ADMIN,
    shift: "office",
  },
  {
    id: "CP034",
    name: "MARIYAM SHIFA",
    position: "STORE KEEPER",
    department: ADMIN,
    shift: "store",
  },
  {
    id: "CP035",
    name: "AISHATH NAZLA",
    position: "LAB TECHNICIAN",
    shift: "office",
  },
];

export const MOCK_EMPLOYEES: Employee[] = SAMPLE_STAFF.map((s) => ({
  id: s.id,
  name: s.name,
  position: s.position,
  department: s.department ?? PLANT,
  sample: true,
}));

export const MOCK_DEPARTMENTS = [
  ...new Set(MOCK_EMPLOYEES.map((e) => e.department)),
].sort();

/** Who holds which post. Absent slots are vacant. */
export const MOCK_CHART: Record<string, string> = Object.fromEntries(
  SAMPLE_STAFF.flatMap((s) => (s.slot ? [[s.slot, s.id]] : [])),
);

export const MOCK_TODAY = toISODate(new Date());

/**
 * The departures the sample ships with.
 *
 * Every state the Status tab can be in, so none of them has to be typed in
 * before it can be looked at: a spell running now, one with no end date, one
 * booked for a date that has not arrived, an exit still to come, an exit that
 * has already happened, and two that have finished and moved to History.
 *
 * Dated relative to today so the sample never goes stale — the running vacation
 * is running whenever the module is opened.
 */
export const MOCK_DEPARTURES: Departure[] = [
  // Running now.
  {
    id: "dep-sample-vacation-running",
    employeeId: "CP018",
    type: "vacation",
    from: addDays(MOCK_TODAY, -3),
    to: addDays(MOCK_TODAY, 4),
  },
  // Open-ended: signed off sick with no return date yet.
  {
    id: "dep-sample-sick-open",
    employeeId: "CP024",
    type: "sick",
    from: addDays(MOCK_TODAY, -1),
  },
  {
    id: "dep-sample-offsite",
    employeeId: "CP009",
    type: "off-site",
    from: MOCK_TODAY,
    to: addDays(MOCK_TODAY, 1),
  },
  // Booked ahead: on the Status tab, noted on the staff row, but deliberately
  // not highlighted and not on any timesheet yet.
  {
    id: "dep-sample-vacation-booked",
    employeeId: "CP006",
    type: "vacation",
    from: addDays(MOCK_TODAY, 9),
    to: addDays(MOCK_TODAY, 16),
  },
  // Leaving: highlighted red from now, still staff, still on the timesheet.
  {
    id: "dep-sample-exit-booked",
    employeeId: "CP014",
    type: "exit",
    from: addDays(MOCK_TODAY, 21),
  },
  // Already gone: off the staff list, still on the sheets they worked, and
  // their post on the chart reads as one the plant has to fill.
  {
    id: "dep-sample-exit-past",
    employeeId: "CP027",
    type: "exit",
    from: addDays(MOCK_TODAY, -5),
  },
  // Finished — these two are what History holds.
  {
    id: "dep-sample-vacation-past",
    employeeId: "CP021",
    type: "vacation",
    from: addDays(MOCK_TODAY, -14),
    to: addDays(MOCK_TODAY, -9),
  },
  {
    id: "dep-sample-sick-past",
    employeeId: "CP030",
    type: "sick",
    from: addDays(MOCK_TODAY, -8),
    to: addDays(MOCK_TODAY, -7),
  },
];

/** How many days of history the mock data covers, including today. */
export const MOCK_DAYS = 21;

/**
 * Every mock entry.
 *
 * Sundays are skipped — the plant's week runs Monday to Saturday, and a column
 * of empty Sundays in the master sheet only makes it harder to read.
 *
 * Exceptions are counted in *working* days back, not calendar days. Keying them
 * on calendar days meant that whenever an exception's day happened to land on a
 * Sunday it was dropped along with the day, so the sample silently lost its sick
 * day or its rain day one week in seven depending on when it was opened.
 *
 * The booked departures are then laid over the result through the same rule the
 * running app uses, rather than being written into the patterns by hand. That
 * way the sample cannot ship disagreeing with itself — a vacation on the Status
 * tab and a full day's hours on the timesheet for the same person is exactly the
 * contradiction the auto-status rule exists to prevent.
 */
function buildEntries(today: string): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  const workingDays: string[] = [];
  for (let daysAgo = MOCK_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    if (new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0) continue;
    workingDays.push(date);
  }

  workingDays.forEach((date, index) => {
    const workingDaysAgo = workingDays.length - 1 - index;

    for (const staff of SAMPLE_STAFF) {
      // Somebody who has left has no rows from their last day on. Their earlier
      // days stay exactly where they are — those are hours the plant paid for.
      const exit = exitOf(MOCK_DEPARTURES, staff.id);
      if (exit && date >= exit.from) continue;

      const shift = SHIFTS[staff.shift ?? "day"];
      const entry: TimesheetEntry = {
        employeeId: staff.id,
        date,
        start: shift.start,
        end: shift.end,
        breaks: [shift.lunch],
        status: "present",
        ...staff.exceptions?.[workingDaysAgo],
      };

      const booked = reconcileEntry(entry, MOCK_DEPARTURES, staff.id, date);
      entries.push(booked.action === "write" ? booked.entry : entry);
    }
  });

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
