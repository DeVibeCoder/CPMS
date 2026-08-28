// =============================================================================
// Attendance calculation tests.
//
//   npm run test:attendance
//
// The engine imports nothing but types, so Node runs the same TypeScript the
// app bundles — these are assertions against the real code, not against a
// re-implementation that could drift from it.
// =============================================================================
import assert from "node:assert/strict";

import {
  DAILY_TARGET_MINUTES,
  calculateEntry,
  formatDuration,
  formatShort,
  monthDates,
  formatDayMonthYear,
  parseDayMonthYear,
  parseTime,
  parseTyped,
  startOfWeek,
  sumEntries,
  weekDates,
} from "../src/lib/attendance/calculations.ts";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log(`  FAIL  ${name}`);
  }
}

const H = 60;
const LUNCH = { from: "12:00", to: "13:00", reason: "LUNCH" };
const entry = (over = {}) => ({
  employeeId: "T1",
  date: "2026-08-03",
  status: "present",
  ...over,
});

console.log("\nTime handling");

test("parseTime reads HH:mm", () => {
  assert.equal(parseTime("07:00"), 7 * H);
  assert.equal(parseTime("17:30"), 17 * H + 30);
});

test("parseTime rejects nonsense rather than guessing", () => {
  assert.equal(parseTime(undefined), null);
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("25:00"), null);
  assert.equal(parseTime("09:60"), null);
  assert.equal(parseTime("noon"), null);
});

test("durations format for reading and for a dense grid", () => {
  assert.equal(formatDuration(8 * H), "8h 00m");
  assert.equal(formatDuration(9 * H + 30), "9h 30m");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatShort(8 * H), "8:00");
  assert.equal(formatShort(7 * H + 45), "7:45");
});

console.log("\nA day's hours");

test("start to end, less the break", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "17:00", breaks: [LUNCH] }));
  assert.equal(t.workedMinutes, 9 * H);
  assert.equal(t.overtimeMinutes, 1 * H);
});

test("a short day has no overtime", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "15:00", breaks: [LUNCH] }));
  assert.equal(t.workedMinutes, 7 * H);
  assert.equal(t.overtimeMinutes, 0);
});

test("exactly eight hours is not overtime", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "16:00", breaks: [LUNCH] }));
  assert.equal(t.workedMinutes, DAILY_TARGET_MINUTES);
  assert.equal(t.overtimeMinutes, 0);
});

test("no break recorded means nothing is deducted", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "15:00" }));
  assert.equal(t.workedMinutes, 8 * H);
});

test("the break is never counted as worked time", () => {
  const withBreak = calculateEntry(
    entry({ start: "07:00", end: "17:00", breaks: [LUNCH] }),
  );
  const without = calculateEntry(entry({ start: "07:00", end: "17:00" }));
  assert.equal(without.workedMinutes - withBreak.workedMinutes, 60);
});

test("a break longer than the shift cannot make the day negative", () => {
  const t = calculateEntry(
    entry({ start: "07:00", end: "09:00", breaks: [{ from: "09:00", to: "19:00" }] }),
  );
  assert.equal(t.workedMinutes, 0);
});

test("a night shift crossing midnight is measured, not treated as negative", () => {
  // The break crosses midnight too — 23:00 to 00:00 is an hour, not minus 23.
  const t = calculateEntry(
    entry({ start: "19:00", end: "04:00", breaks: [{ from: "23:00", to: "00:00" }] }),
  );
  assert.equal(t.workedMinutes, 8 * H);
  assert.equal(t.overtimeMinutes, 0);
});

test("a day can have more than one gap — the rain-release case", () => {
  // Out at 07:00, lunch, released at 13:00 for weather, back at 15:00, home
  // at 18:00. Eleven hours on site, three of them not worked.
  const t = calculateEntry(
    entry({
      start: "07:00",
      end: "18:00",
      breaks: [LUNCH, { from: "13:00", to: "15:00", reason: "RAIN" }],
    }),
  );
  assert.equal(t.workedMinutes, 8 * H);
  assert.equal(t.overtimeMinutes, 0);
});

test("gaps are totalled, and an unreadable one is skipped not guessed", () => {
  const t = calculateEntry(
    entry({
      start: "07:00",
      end: "17:00",
      breaks: [LUNCH, { from: "", to: "" }, { from: "15:00", to: "15:30" }],
    }),
  );
  assert.equal(t.workedMinutes, 8 * H + 30);
});

console.log("\nMissing and non-working days");

test("no entry at all is unknown, not zero", () => {
  assert.equal(calculateEntry(undefined).workedMinutes, null);
});

test("clocked in but never out is unknown, not a full day", () => {
  assert.equal(calculateEntry(entry({ start: "07:00" })).workedMinutes, null);
});

test("sick and vacation are zero by rule, not by missing data", () => {
  assert.equal(calculateEntry(entry({ status: "sick" })).workedMinutes, 0);
  assert.equal(calculateEntry(entry({ status: "vacation" })).workedMinutes, 0);
});

test("a sick day ignores any times left behind on the row", () => {
  const t = calculateEntry(
    entry({ status: "sick", start: "07:00", end: "17:00", breaks: [LUNCH] }),
  );
  assert.equal(t.workedMinutes, 0);
  assert.equal(t.overtimeMinutes, 0);
});

console.log("\nTotals");

test("a week of eight-hour days totals 48 with no overtime", () => {
  const week = Array.from({ length: 6 }, () =>
    entry({ start: "07:00", end: "16:00", breaks: [LUNCH] }),
  );
  const t = sumEntries(week);
  assert.equal(t.workedMinutes, 48 * H);
  assert.equal(t.overtimeMinutes, 0);
  assert.equal(t.daysPresent, 6);
});

test("overtime accumulates per day, above eight hours", () => {
  const t = sumEntries([
    entry({ start: "07:00", end: "17:00", breaks: [LUNCH] }), // 9h → 1h OT
    entry({ start: "07:00", end: "18:00", breaks: [LUNCH] }), // 10h → 2h OT
    entry({ start: "07:00", end: "15:00", breaks: [LUNCH] }), // 7h → none
  ]);
  assert.equal(t.workedMinutes, 26 * H);
  assert.equal(t.overtimeMinutes, 3 * H);
});

test("unknown days are skipped rather than counted as zero", () => {
  const t = sumEntries([
    entry({ start: "07:00", end: "16:00", breaks: [LUNCH] }),
    undefined,
    entry({ start: "07:00" }),
  ]);
  assert.equal(t.workedMinutes, 8 * H);
  assert.equal(t.daysPresent, 1);
});

test("leave days count as present-zero, not as worked days", () => {
  const t = sumEntries([entry({ status: "vacation" }), entry({ status: "sick" })]);
  assert.equal(t.workedMinutes, 0);
  assert.equal(t.daysPresent, 0);
});

console.log("\nDates");

test("weeks run Monday to Sunday, and Sunday belongs to the week before", () => {
  assert.equal(startOfWeek("2026-08-03"), "2026-08-03"); // Monday
  assert.equal(startOfWeek("2026-08-09"), "2026-08-03"); // Sunday
  assert.equal(startOfWeek("2026-08-10"), "2026-08-10");
  assert.equal(weekDates("2026-08-05").length, 7);
});

test("month dates cover the month and nothing else", () => {
  const june = monthDates("2026-06-15");
  assert.equal(june.length, 30);
  assert.equal(june[0], "2026-06-01");
  assert.equal(june[29], "2026-06-30");
  assert.equal(monthDates("2026-02-10").length, 28);
});

// -----------------------------------------------------------------------------
// The row shapes.
//
// Columns are snake_case and the domain types are camelCase, so something has to
// translate — and the translation is not only naming. The database says "absent"
// with null; the domain says it by leaving the property off. A row that came back
// from a round trip looking different from the one that went in would read as an
// edit to the change detector that decides what to save, and every untouched
// sheet in the plant would be written back on every load.
// -----------------------------------------------------------------------------
const {
  fromDeparture,
  fromEmployee,
  fromEntry,
  toDeparture,
  toEmployee,
  toEntry,
} = await import("../src/lib/attendance/rows.ts");

console.log("\nRow mapping");

const roundTripEntry = (e) => toEntry(fromEntry(e));

test("a worked day round-trips unchanged", () => {
  const day = entry({ start: "07:00", end: "16:00", breaks: [LUNCH], remarks: "OK" });
  assert.deepEqual(roundTripEntry(day), day);
});

test("absent is the property missing, not a null", () => {
  const bare = entry();
  const there = fromEntry(bare);
  assert.equal(there.start_time, null);
  assert.equal(there.end_time, null);
  assert.equal(there.remarks, null);

  const back = roundTripEntry(bare);
  for (const key of ["start", "end", "remarks", "breaks", "auto"]) {
    assert.ok(!(key in back), `${key} came back as a key`);
  }
});

test("a day with no gaps and a day with an empty list are the same day", () => {
  assert.deepEqual(roundTripEntry(entry({ breaks: [] })), roundTripEntry(entry()));
});

test("a remarks box typed into and cleared again holds no remark", () => {
  assert.equal(fromEntry(entry({ remarks: "   " })).remarks, null);
});

test("a row written from a booking says so, and one that was not stays quiet", () => {
  const booked = entry({ status: "vacation", auto: true });
  assert.equal(fromEntry(booked).auto, true);
  assert.equal(roundTripEntry(booked).auto, true);
  assert.equal(fromEntry(entry()).auto, false);
});

test("an employee round-trips unchanged", () => {
  const person = {
    id: "CP001",
    name: "AHMED SHAREEF",
    department: "CEMENT PLANT",
    position: "OPERATION MANAGER",
  };
  assert.deepEqual(toEmployee(fromEmployee(person)), person);
});

test("a spell away round-trips, and a one-way exit keeps no end date", () => {
  const spell = {
    id: "d1",
    employeeId: "CP001",
    type: "vacation",
    from: "2026-08-10",
    to: "2026-08-20",
  };
  assert.deepEqual(toDeparture(fromDeparture(spell)), spell);

  const leaving = { id: "d2", employeeId: "CP001", type: "exit", from: "2026-09-30" };
  assert.equal(fromDeparture(leaving).to_date, null);
  const back = toDeparture(fromDeparture(leaving));
  assert.ok(!("to" in back), "an exit came back with a To date");
  assert.deepEqual(back, leaving);
});

test("an open-ended spell is the same shape as an exit's missing end", () => {
  const open = { id: "d3", employeeId: "CP001", type: "sick", from: "2026-08-10" };
  assert.deepEqual(toDeparture(fromDeparture(open)), open);
});

// -----------------------------------------------------------------------------
// The staff list import. A file a clerk typed into Excel is the least
// predictable input the module has, so the cases below are the ones that
// actually arrive: reordered columns, blank cells, and a status column spelled
// however that spreadsheet spelled it.
// -----------------------------------------------------------------------------
const { employeeTemplateCsv, employeesToCsv, parseEmployeesCsv } = await import(
  "../src/lib/attendance/employeeCsv.ts"
);

console.log("\nEmployee import");

const onSite = () => "on-site";

test("the template is itself a valid import file", () => {
  const { rows, errors } = parseEmployeesCsv(employeeTemplateCsv());
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], {
    id: "E001",
    name: "EXAMPLE NAME",
    position: "OPERATOR",
    department: "CEMENT PLANT",
    presence: "on-site",
  });
  assert.equal(rows[1].presence, "vacation");
});

test("an export can be imported back unchanged", () => {
  const people = [
    { id: "E001", name: 'O"Brien, A', department: "CEMENT PLANT", position: "OPERATOR" },
    { id: "E002", name: "Beta", department: "ADMINISTRATION", position: "CLERK" },
  ];
  const { rows, errors } = parseEmployeesCsv(employeesToCsv(people, onSite));
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rows.map(({ presence, ...e }) => e),
    people,
  );
});

test("an export carries each person's own status back out", () => {
  const people = [
    { id: "E001", name: "One", department: "CEMENT PLANT", position: "OPERATOR" },
    { id: "E002", name: "Two", department: "CEMENT PLANT", position: "CRANE OPERATOR" },
  ];
  const csv = employeesToCsv(people, (e) =>
    e.id === "E002" ? "sick" : "off-site",
  );
  const { rows } = parseEmployeesCsv(csv);
  assert.deepEqual(rows.map((r) => r.presence), ["off-site", "sick"]);
});

test("columns are matched by name, so reordering and extras are fine", () => {
  const { rows, errors } = parseEmployeesCsv(
    "Extra,Section,Name,Status,Emp ID,Designation\nx,CEMENT PLANT,Ali,Vacation,9001,Crane Operator\n",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], {
    id: "9001",
    name: "Ali",
    position: "Crane Operator",
    department: "CEMENT PLANT",
    presence: "vacation",
  });
});

test("staff numbers are taken in whatever form the plant writes them", () => {
  const { rows, errors } = parseEmployeesCsv(
    "Emp ID,Name\n7,Seven\nEMP-12/A,Slashes\n0042,Leading zeroes\n",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map((r) => r.id), ["7", "EMP-12/A", "0042"]);
});

test("a blank status means on site, and the usual spellings are understood", () => {
  const { rows, errors } = parseEmployeesCsv(
    "Emp ID,Name,Status\nA1,One,\nA2,Two,ON SITE\nA3,Three,off-site\nA4,Four,Annual Leave\nA5,Five,sick leave\n",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map((r) => r.presence), [
    "on-site",
    "on-site",
    "off-site",
    "vacation",
    "sick",
  ]);
});

test("an unreadable status is an error rather than a guess", () => {
  const { rows, errors } = parseEmployeesCsv("Emp ID,Name,Status\nA1,One,maybe\n");
  assert.equal(rows.length, 0);
  assert.match(errors[0], /Line 2/);
  assert.match(errors[0], /On site/);
});

test("a bad row is reported and the rest still import", () => {
  const { rows, errors } = parseEmployeesCsv("Emp ID,Name\n,Nobody\nA2,\nA3,Three\n");
  assert.deepEqual(rows.map((r) => r.id), ["A3"]);
  assert.equal(errors.length, 2);
});

test("a repeated ID is skipped rather than silently overwriting", () => {
  const { rows, errors } = parseEmployeesCsv(
    "Emp ID,Name\nA1,One\na001,First\nA001,Second\n",
  );
  assert.deepEqual(rows.map((r) => r.name), ["One", "First"]);
  assert.match(errors[0], /more than once/);
});

test("the blank rows Excel leaves behind are not errors", () => {
  const { rows, errors } = parseEmployeesCsv("Emp ID,Name\nA1,One\n,\n , \n");
  assert.equal(rows.length, 1);
  assert.deepEqual(errors, []);
});

test("a file with the wrong headers is rejected with an instruction", () => {
  const { rows, errors } = parseEmployeesCsv("Number,Person\n1,Ali\n");
  assert.equal(rows.length, 0);
  assert.match(errors[0], /template/);
});

test("an empty file is rejected", () => {
  assert.match(parseEmployeesCsv("").errors[0], /empty/);
});

// Excel splits a double-clicked .csv on the machine's regional list separator,
// so a comma file opens with every row in column A. The template says `sep=,`
// to stop that — and has to survive the file coming back written the other way.

test("the template tells Excel to split on commas", () => {
  const [first] = employeeTemplateCsv().replace(/^﻿/, "").split("\r\n");
  assert.equal(first, "sep=,");
});

test("the directive is a directive, not a row of staff", () => {
  const { rows } = parseEmployeesCsv(employeeTemplateCsv());
  assert.equal(rows.length, 2);
  assert.ok(!rows.some((r) => r.id.startsWith("sep")));
});

test("a file Excel saved back with semicolons still imports", () => {
  const { rows, errors } = parseEmployeesCsv(
    "sep=,\r\nEmp ID;Name;Designation;Section;Status (On site/Off site/Vacation/Sick)\r\n" +
      "E001;Ali;Operator;CEMENT PLANT;On site\r\n",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], {
    id: "E001",
    name: "Ali",
    position: "Operator",
    department: "CEMENT PLANT",
    presence: "on-site",
  });
});

test("a semicolon file keeps a comma inside a name", () => {
  const { rows, errors } = parseEmployeesCsv("Emp ID;Name\r\nE001;Doe, John\r\n");
  assert.deepEqual(errors, []);
  assert.equal(rows[0].name, "Doe, John");
});

test("a tab-separated file imports too", () => {
  const { rows } = parseEmployeesCsv("Emp ID\tName\tSection\nE001\tAli\tCEMENT PLANT\n");
  assert.equal(rows[0].department, "CEMENT PLANT");
});

// -----------------------------------------------------------------------------
// Departures.
//
// Vacation, sick, off site and exits are one list against one set of rules.
// These assert the two that are easy to get backwards: an exit is loud
// immediately and changes no status, and a spell away is silent until it starts.
// -----------------------------------------------------------------------------
const {
  awayOn,
  departureFromPresence,
  exitOf,
  hasExited,
  isBooked,
  isCurrentStaff,
  isHighlighted,
  isLeaving,
  isOpenOn,
  presenceOf,
  upper,
  wasEmployedOn,
} = await import("../src/lib/attendance/staff.ts");

console.log("\nDepartures");

const TODAY = "2026-08-14";
const person = (over = {}) => ({
  id: "E001",
  name: "Test Person",
  department: "CEMENT PLANT",
  position: "OPERATOR",
  ...over,
});
const dep = (over = {}) => ({
  id: "d1",
  employeeId: "E001",
  type: "vacation",
  from: TODAY,
  ...over,
});

test("an exit booked ahead keeps them on the staff list", () => {
  const d = [dep({ type: "exit", from: "2026-09-30" })];
  assert.equal(isCurrentStaff(d, "E001", TODAY), true);
  assert.equal(hasExited(d, "E001", TODAY), false);
});

test("an exit booked ahead highlights the row straight away", () => {
  const d = [dep({ type: "exit", from: "2026-09-30" })];
  assert.equal(isLeaving(d, "E001", TODAY), true);
  assert.equal(isHighlighted(d, "E001", TODAY), true);
});

test("a pending exit leaves the status alone", () => {
  const d = [dep({ type: "exit", from: "2026-09-30" })];
  assert.equal(presenceOf(person(), d, entry({ start: "07:00" }), TODAY), "on-site");
  assert.equal(presenceOf(person(), d, undefined, TODAY), "on-site");
});

test("the exit date arriving takes them off the staff list", () => {
  const d = [dep({ type: "exit", from: TODAY })];
  assert.equal(hasExited(d, "E001", TODAY), true);
  assert.equal(isCurrentStaff(d, "E001", TODAY), false);
  // No longer pending, so no longer highlighted — they are on the other list.
  assert.equal(isLeaving(d, "E001", TODAY), false);
});

test("someone who left still belongs on the sheets for the days they worked", () => {
  const d = [dep({ type: "exit", from: "2026-08-10" })];
  assert.equal(wasEmployedOn(d, "E001", "2026-08-07"), true);
  assert.equal(wasEmployedOn(d, "E001", "2026-08-10"), false);
  assert.equal(wasEmployedOn([], "E001", "2026-08-07"), true);
});

test("the earliest exit wins if two were entered", () => {
  const d = [
    dep({ id: "a", type: "exit", from: "2026-12-01" }),
    dep({ id: "b", type: "exit", from: "2026-09-01" }),
  ];
  assert.equal(exitOf(d, "E001").from, "2026-09-01");
});

test("a departure booked ahead is not highlighted and changes nothing yet", () => {
  const d = [dep({ from: "2026-09-01", to: "2026-09-14" })];
  assert.equal(isBooked(d, "E001", TODAY), true);
  assert.equal(awayOn(d, "E001", TODAY), undefined);
  assert.equal(isHighlighted(d, "E001", TODAY), false);
  assert.equal(presenceOf(person(), d, undefined, TODAY), "on-site");
});

test("the From date arriving highlights the row and shows the reason", () => {
  const d = [dep({ from: TODAY, to: "2026-08-28" })];
  assert.equal(Boolean(awayOn(d, "E001", TODAY)), true);
  assert.equal(isHighlighted(d, "E001", TODAY), true);
  assert.equal(presenceOf(person(), d, undefined, TODAY), "vacation");
});

test("each type reads back as its own status", () => {
  for (const type of ["vacation", "sick", "off-site"]) {
    const d = [dep({ type, from: "2026-08-01", to: "2026-08-20" })];
    assert.equal(presenceOf(person(), d, undefined, TODAY), type);
  }
});

test("a booked departure outranks a timesheet row that has not caught up", () => {
  const d = [dep({ type: "sick", from: TODAY })];
  assert.equal(presenceOf(person(), d, entry({ start: "07:00" }), TODAY), "sick");
});

test("a departure that has finished stops highlighting", () => {
  const d = [dep({ from: "2026-07-01", to: "2026-07-14" })];
  assert.equal(awayOn(d, "E001", TODAY), undefined);
  assert.equal(isHighlighted(d, "E001", TODAY), false);
});

test("a departure with no To date is still running", () => {
  const d = [dep({ type: "sick", from: "2026-07-01" })];
  assert.equal(Boolean(awayOn(d, "E001", TODAY)), true);
});

test("one person's departure does not touch anybody else", () => {
  const d = [dep({ employeeId: "E002", type: "exit", from: "2026-01-01" })];
  assert.equal(hasExited(d, "E001", TODAY), false);
  assert.equal(isHighlighted(d, "E001", TODAY), false);
});

test("on site is the default — nobody has to clock in to earn it", () => {
  // The bug this replaces: a staff list imported as On site read back as Off
  // site, because nobody had a timesheet row yet.
  assert.equal(presenceOf(person(), [], undefined, TODAY), "on-site");
  assert.equal(presenceOf(person(), [], entry({ start: "07:00" }), TODAY), "on-site");
  assert.equal(
    presenceOf(person(), [], entry({ start: "07:00", end: "16:00" }), TODAY),
    "on-site",
  );
});

test("Status holds what is running or still to come; History holds the rest", () => {
  // An exit closes the day it arrives — after that the person has gone.
  assert.equal(isOpenOn(dep({ type: "exit", from: "2026-09-30" }), TODAY), true);
  assert.equal(isOpenOn(dep({ type: "exit", from: TODAY }), TODAY), false);
  // A spell closes when its To date passes.
  assert.equal(isOpenOn(dep({ to: "2026-08-20" }), TODAY), true);
  assert.equal(isOpenOn(dep({ from: "2026-07-01", to: "2026-07-14" }), TODAY), false);
  // Open-ended means open-ended.
  assert.equal(isOpenOn(dep({ from: "2026-01-01" }), TODAY), true);
});

test("off site is booked, not inferred from an empty timesheet", () => {
  const d = [dep({ type: "off-site", from: TODAY, to: "2026-08-20" })];
  assert.equal(presenceOf(person(), d, undefined, TODAY), "off-site");
  // ...and it ends when the booking ends.
  assert.equal(presenceOf(person(), d, undefined, "2026-08-21"), "on-site");
});

test("a day marked sick on the timesheet shows as Sick", () => {
  assert.equal(presenceOf(person(), [], entry({ status: "sick" }), TODAY), "sick");
  assert.equal(
    presenceOf(person(), [], entry({ status: "vacation" }), TODAY),
    "vacation",
  );
});

test("an imported status becomes an open departure, and On site becomes none", () => {
  assert.equal(departureFromPresence("E001", "on-site", TODAY, "x"), undefined);
  assert.deepEqual(departureFromPresence("E001", "sick", TODAY, "x"), {
    id: "x",
    employeeId: "E001",
    type: "sick",
    from: TODAY,
  });
});

test("an imported status round-trips back to the same status", () => {
  for (const presence of ["off-site", "vacation", "sick"]) {
    const d = [departureFromPresence("E001", presence, TODAY, "x")];
    assert.equal(presenceOf(person(), d, undefined, TODAY), presence);
  }
});

// -----------------------------------------------------------------------------
// The sections a cement plant has.
// -----------------------------------------------------------------------------
const { PLANT_SECTIONS, normaliseSection } = await import(
  "../src/lib/attendance/sections.ts"
);

console.log("\nSections");

test("there are exactly two sections, and both are upper case", () => {
  assert.deepEqual([...PLANT_SECTIONS], ["CEMENT PLANT", "ADMINISTRATION"]);
});

test("upper trims as well as capitalises, so stray spaces do not split names", () => {
  assert.equal(upper("  ahmed shareef "), "AHMED SHAREEF");
  assert.equal(upper("Emp-12/a"), "EMP-12/A");
});

test("a section is folded onto the fixed list however it was typed", () => {
  assert.equal(normaliseSection("cement plant"), "CEMENT PLANT");
  assert.equal(normaliseSection("  Administration "), "ADMINISTRATION");
});

test("a section that does not exist is kept, not silently relabelled", () => {
  assert.equal(normaliseSection("Quarry"), "QUARRY");
});

// -----------------------------------------------------------------------------
// Automatic status. A departure recorded once on the Status tab has to reach the
// timesheet rows, and withdrawing it has to take those rows back off again. The
// second half is the one worth testing: it is the half a stored row can get
// wrong, and the half that needs the `auto` flag to be possible at all.
// -----------------------------------------------------------------------------
const { bookedStatus, reconcileEntry, reconcileEntries } = await import(
  "../src/lib/attendance/autoStatus.ts"
);

console.log("\nAutomatic status");

const AT = "2026-08-14";
const vacation = [
  { id: "v1", employeeId: "E001", type: "vacation", from: "2026-08-10", to: "2026-08-20" },
];
const worked = {
  employeeId: "E001",
  date: AT,
  start: "07:00",
  end: "16:00",
  breaks: [LUNCH],
  status: "present",
};

test("a booked spell away names the status the day has to take", () => {
  assert.equal(bookedStatus(vacation, "E001", AT), "vacation");
  assert.equal(bookedStatus(vacation, "E001", "2026-08-21"), null);
  assert.equal(bookedStatus(vacation, "E002", AT), null);
});

test("an exit is not a spell away, so it forces no status", () => {
  const gone = [{ id: "x1", employeeId: "E001", type: "exit", from: "2026-08-01" }];
  assert.equal(bookedStatus(gone, "E001", AT), null);
});

test("a booked vacation takes the hours off the day it covers", () => {
  const result = reconcileEntry(worked, vacation, "E001", AT);
  assert.equal(result.action, "write");
  assert.equal(result.entry.status, "vacation");
  assert.equal(result.entry.auto, true);
  assert.equal(result.entry.start, undefined);
  assert.equal(result.entry.end, undefined);
  assert.equal(result.entry.breaks, undefined);
});

test("a row already written from the booking is left alone", () => {
  const written = reconcileEntry(worked, vacation, "E001", AT).entry;
  assert.equal(reconcileEntry(written, vacation, "E001", AT).action, "keep");
});

test("a day with nothing booked and no row stays a day with no row", () => {
  assert.equal(reconcileEntry(undefined, [], "E001", AT).action, "keep");
});

test("withdrawing the departure takes the row away with it", () => {
  const written = reconcileEntry(worked, vacation, "E001", AT).entry;
  assert.equal(reconcileEntry(written, [], "E001", AT).action, "delete");
});

// The timesheet has no status control on it any more, so a status with no
// booking behind it can only be left over — from a departure since withdrawn, or
// from a sheet written when the dropdown still existed. There is nowhere left to
// correct one by hand, which is why the rule has to.
test("a status with no booking behind it is put back to present", () => {
  const leftOver = { employeeId: "E001", date: AT, status: "sick", start: "07:00" };
  const back = reconcileEntry(leftOver, [], "E001", AT);
  assert.equal(back.action, "write");
  assert.equal(back.entry.status, "present");
  // Only the status was ever ours. The hours somebody typed stay.
  assert.equal(back.entry.start, "07:00");
});

test("an ordinary worked day is left alone", () => {
  assert.equal(reconcileEntry(worked, [], "E001", AT).action, "keep");
});

test("a booking that moves takes the old day back with it", () => {
  const written = reconcileEntry(worked, vacation, "E001", AT).entry;
  // Same person, same vacation, a week later: the day it used to cover is a
  // working day again and its row goes.
  const moved = [{ ...vacation[0], from: "2026-08-24", to: "2026-08-28" }];
  assert.equal(reconcileEntry(written, moved, "E001", AT).action, "delete");
  // And a day it now covers gets a row of its own, whether or not one was there.
  const fresh = reconcileEntry(undefined, moved, "E001", "2026-08-25");
  assert.equal(fresh.action, "write");
  assert.equal(fresh.entry.status, "vacation");
});

test("a remark somebody wrote survives the status being written over it", () => {
  const noted = { ...worked, remarks: "CALLED IN" };
  const written = reconcileEntry(noted, vacation, "E001", AT).entry;
  assert.equal(written.remarks, "CALLED IN");

  // And survives the departure being withdrawn: the row is handed back as an
  // ordinary open day rather than deleted out from under the note.
  const back = reconcileEntry(written, [], "E001", AT);
  assert.equal(back.action, "write");
  assert.equal(back.entry.status, "present");
  assert.equal(back.entry.auto, undefined);
  assert.equal(back.entry.remarks, "CALLED IN");
});

test("a completed day is a record, and is not rewritten", () => {
  const rows = new Map([["E001|" + AT, worked]]);
  assert.equal(reconcileEntries(rows, vacation, () => true), rows);
});

test("nothing to change hands the same map back, so nothing re-renders", () => {
  const rows = new Map([["E001|" + AT, worked]]);
  assert.equal(reconcileEntries(rows, [], () => false), rows);
});

test("reconciling a set writes only the rows the booking covers", () => {
  const other = { ...worked, employeeId: "E002" };
  const rows = new Map([
    ["E001|" + AT, worked],
    ["E002|" + AT, other],
  ]);
  const next = reconcileEntries(rows, vacation, () => false);
  assert.notEqual(next, rows);
  assert.equal(next.get("E001|" + AT).status, "vacation");
  assert.equal(next.get("E002|" + AT).status, "present");
});

// -----------------------------------------------------------------------------
// The org chart. Posts, not people — the shape is fixed and who fills it is not.
// -----------------------------------------------------------------------------
const { ALL_SLOTS, PLANT_GROUPS, DISPATCH_GROUPS, groupColumns } = await import(
  "../src/lib/attendance/orgChart.ts"
);

// 33 posts, of which the paper chart shows 32 filled — Plant-3's assistant
// plant operator is vacant. Posts and people are different counts, and the
// chart has to be able to say so.
test("the chart holds every post, vacant ones included", () => {
  assert.equal(ALL_SLOTS.length, 33);
});

test("the manpower lines add up the way the paper chart does", () => {
  const by = (line) => ALL_SLOTS.filter((s) => s.counts === line).length;
  assert.equal(by("manager"), 1);
  assert.equal(by("dispatch"), 1);
  assert.equal(by("supervisor"), 2);
  assert.equal(by("plantOperator"), 3);
  assert.equal(by("assistantPlantOperator"), 3);
  assert.equal(by("vehicleOperator"), 7);
  assert.equal(by("assistant"), 16);
});

test("slot ids are unique — they are the key assignments are stored against", () => {
  const ids = ALL_SLOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("each plant has an operator, an assistant operator and four assistants", () => {
  assert.equal(PLANT_GROUPS.length, 3);
  for (const g of PLANT_GROUPS) {
    assert.equal(g.slots.length, 6);
    assert.equal(g.slots.filter((s) => s.counts === "assistant").length, 4);
  }
});

test("logistics holds all seven vehicle operators", () => {
  const logistics = DISPATCH_GROUPS.find((g) => g.id === "logistics");
  assert.equal(logistics.slots.length, 7);
  assert.ok(logistics.slots.every((s) => s.counts === "vehicleOperator"));
});

test("logistics is drawn as one column per designation", () => {
  const logistics = DISPATCH_GROUPS.find((g) => g.id === "logistics");
  const columns = groupColumns(logistics);
  assert.deepEqual(
    columns.map((c) => c.length),
    [3, 3, 1],
    "three heavy vehicle, three forklift, one pickup",
  );
  for (const column of columns) {
    assert.equal(new Set(column.map((s) => s.title)).size, 1);
  }
});

test("every other team is one column, in the order the posts are declared", () => {
  for (const group of [...PLANT_GROUPS, DISPATCH_GROUPS[1]]) {
    const columns = groupColumns(group);
    assert.equal(columns.length, 1, group.id);
    assert.deepEqual(columns[0], group.slots);
  }
});

test("splitting into columns loses nobody", () => {
  for (const group of [...DISPATCH_GROUPS, ...PLANT_GROUPS]) {
    assert.deepEqual(groupColumns(group).flat(), group.slots, group.id);
  }
});

// -----------------------------------------------------------------------------
// Typed times. The timesheet takes 24-hour input rather than a locale picker.
// -----------------------------------------------------------------------------
console.log("\nTyped times");

test("the shorthand a clerk actually types is understood", () => {
  assert.equal(parseTyped("7"), "07:00");
  assert.equal(parseTyped("700"), "07:00");
  assert.equal(parseTyped("0700"), "07:00");
  assert.equal(parseTyped("7:00"), "07:00");
  assert.equal(parseTyped("07.00"), "07:00");
  assert.equal(parseTyped(" 1930 "), "19:30");
  assert.equal(parseTyped("2359"), "23:59");
  assert.equal(parseTyped("0"), "00:00");
});

test("a date is read and shown the way the plant writes it", () => {
  // Any separator is read; one is written back.
  assert.equal(parseDayMonthYear("25/12/2026"), "2026-12-25");
  assert.equal(parseDayMonthYear("25-12-2026"), "2026-12-25");
  assert.equal(parseDayMonthYear("25.12.2026"), "2026-12-25");
  assert.equal(parseDayMonthYear(" 5/1/2026 "), "2026-01-05");
  assert.equal(formatDayMonthYear("2026-12-25"), "25/12/2026");
  assert.equal(formatDayMonthYear("2026-01-05"), "05/01/2026");
});

// -----------------------------------------------------------------------------
// The date field, as eight boxes and two fixed slashes.
//
// Everything the field does is here, so it can be checked by running it rather
// than by clicking it: eight digits fill it, backspace empties it right to left,
// and the slashes never move because they are not part of what is typed.
// -----------------------------------------------------------------------------
const {
  dateFrom, deleteBack, isBlank, render, segmentAt, segmentRange, slotsFor, step, typeDigit,
} = await import("../src/lib/attendance/dateMask.ts");

console.log("\nDate field");

/** Type a string of digits into an empty field, one key at a time. */
function typeAll(digits) {
  let state = { slots: slotsFor(""), segment: 0, cursor: 0 };
  const seen = [];
  for (const digit of digits) {
    state = typeDigit(state.slots, state.segment, state.cursor, digit);
    seen.push(render(state.slots));
  }
  return { state, seen };
}

test("the field shows its shape before anything is typed", () => {
  assert.equal(render(slotsFor("")), "dd/mm/yyyy");
  assert.ok(isBlank(slotsFor("")));
});

test("eight digits fill it, and the caret walks day to month to year", () => {
  const { seen } = typeAll("25122026");
  assert.deepEqual(seen, [
    "2d/mm/yyyy",
    "25/mm/yyyy",
    "25/1m/yyyy",
    "25/12/yyyy",
    "25/12/2yyy",
    "25/12/20yy",
    "25/12/202y",
    "25/12/2026",
  ]);
});

test("filling a segment moves to the next one on its own", () => {
  let s = typeAll("25").state;
  assert.equal(s.segment, 1, "the day being full moves to the month");
  assert.equal(s.cursor, 0);
  s = typeAll("2512").state;
  assert.equal(s.segment, 2, "the month being full moves to the year");
});

test("a ninth digit is dropped rather than rewriting a finished date", () => {
  const { state } = typeAll("251220269");
  assert.equal(render(state.slots), "25/12/2026");
});

test("the completed date is handed up, and a partial one is not", () => {
  assert.equal(dateFrom(typeAll("25122026").state.slots), "2026-12-25");
  assert.equal(dateFrom(typeAll("2512").state.slots), "", "half a date is not a date");
  assert.equal(dateFrom(typeAll("31022026").state.slots), "", "31 February is not a day");
});

test("backspace empties it right to left, across the slashes", () => {
  let state = typeAll("25122026").state;
  const seen = [];
  for (let i = 0; i < 9; i += 1) {
    state = deleteBack(state.slots, state.segment, state.cursor);
    seen.push(render(state.slots));
  }
  assert.deepEqual(seen.slice(0, 5), [
    "25/12/202y",
    "25/12/20yy",
    "25/12/2yyy",
    "25/12/yyyy",
    "25/1m/yyyy",
  ]);
  // It stops at the beginning rather than running off it.
  assert.equal(render(state.slots), "dd/mm/yyyy");
  assert.ok(isBlank(state.slots));
});

test("clicking anywhere in a segment picks that segment", () => {
  assert.deepEqual([0, 1, 2].map(segmentAt), [0, 0, 0], "the day, and the slash after it");
  assert.deepEqual([3, 4, 5].map(segmentAt), [1, 1, 1], "the month");
  assert.deepEqual([6, 8, 10].map(segmentAt), [2, 2, 2], "the year");
});

test("a picked segment is selected whole, so a digit replaces it", () => {
  assert.deepEqual(segmentRange(0), [0, 2]);
  assert.deepEqual(segmentRange(1), [3, 5]);
  assert.deepEqual(segmentRange(2), [6, 10]);
});

test("arrows step between segments and stop at the ends", () => {
  assert.equal(step(0, -1), 0);
  assert.equal(step(0, 1), 1);
  assert.equal(step(2, 1), 2);
});

test("a stored date opens the field already filled", () => {
  assert.equal(render(slotsFor("2026-12-25")), "25/12/2026");
  assert.equal(render(slotsFor("")), "dd/mm/yyyy");
  assert.equal(dateFrom(slotsFor("2026-12-25")), "2026-12-25");
});

test("a date round-trips through both directions unchanged", () => {
  for (const iso of ["2026-01-01", "2026-02-28", "2026-12-31", "2024-02-29"]) {
    assert.equal(parseDayMonthYear(formatDayMonthYear(iso)), iso, iso);
  }
});

test("a day that does not exist is refused, not rolled into the next month", () => {
  // The failure this exists for: Date happily turns 31 February into 3 March,
  // and a booking silently a week out is worse than one that would not save.
  assert.equal(parseDayMonthYear("31/02/2026"), null);
  assert.equal(parseDayMonthYear("29/02/2026"), null);
  assert.equal(parseDayMonthYear("29/02/2024"), "2024-02-29", "2024 is a leap year");
  assert.equal(parseDayMonthYear("32/01/2026"), null);
  assert.equal(parseDayMonthYear("01/13/2026"), null);
});

test("something that is not a date is refused rather than guessed at", () => {
  assert.equal(parseDayMonthYear(""), null);
  assert.equal(parseDayMonthYear("25/12"), null);
  assert.equal(parseDayMonthYear("25/12/26"), null, "a two-digit year is ambiguous");
  assert.equal(parseDayMonthYear("2026-12-25"), null, "that is the stored form, not the typed one");
  assert.equal(parseDayMonthYear("tomorrow"), null);
});

test("a time that is not a time is refused, not rounded into one", () => {
  assert.equal(parseTyped(""), null);
  assert.equal(parseTyped("2500"), null);
  assert.equal(parseTyped("0760"), null);
  assert.equal(parseTyped("abc"), null);
  assert.equal(parseTyped("123456"), null);
});

// -----------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
