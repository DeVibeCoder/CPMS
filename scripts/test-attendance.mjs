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
  parseTime,
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
  const t = calculateEntry(entry({ start: "07:00", end: "17:00", breakMinutes: 60 }));
  assert.equal(t.workedMinutes, 9 * H);
  assert.equal(t.overtimeMinutes, 1 * H);
});

test("a short day has no overtime", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "15:00", breakMinutes: 60 }));
  assert.equal(t.workedMinutes, 7 * H);
  assert.equal(t.overtimeMinutes, 0);
});

test("exactly eight hours is not overtime", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "16:00", breakMinutes: 60 }));
  assert.equal(t.workedMinutes, DAILY_TARGET_MINUTES);
  assert.equal(t.overtimeMinutes, 0);
});

test("no break recorded means nothing is deducted", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "15:00" }));
  assert.equal(t.workedMinutes, 8 * H);
});

test("the break is never counted as worked time", () => {
  const withBreak = calculateEntry(
    entry({ start: "07:00", end: "17:00", breakMinutes: 60 }),
  );
  const without = calculateEntry(entry({ start: "07:00", end: "17:00" }));
  assert.equal(without.workedMinutes - withBreak.workedMinutes, 60);
});

test("a break longer than the shift cannot make the day negative", () => {
  const t = calculateEntry(entry({ start: "07:00", end: "09:00", breakMinutes: 600 }));
  assert.equal(t.workedMinutes, 0);
});

test("a night shift crossing midnight is measured, not treated as negative", () => {
  const t = calculateEntry(entry({ start: "19:00", end: "04:00", breakMinutes: 60 }));
  assert.equal(t.workedMinutes, 8 * H);
  assert.equal(t.overtimeMinutes, 0);
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
    entry({ status: "sick", start: "07:00", end: "17:00", breakMinutes: 60 }),
  );
  assert.equal(t.workedMinutes, 0);
  assert.equal(t.overtimeMinutes, 0);
});

console.log("\nTotals");

test("a week of eight-hour days totals 48 with no overtime", () => {
  const week = Array.from({ length: 6 }, () =>
    entry({ start: "07:00", end: "16:00", breakMinutes: 60 }),
  );
  const t = sumEntries(week);
  assert.equal(t.workedMinutes, 48 * H);
  assert.equal(t.overtimeMinutes, 0);
  assert.equal(t.daysPresent, 6);
});

test("overtime accumulates per day, above eight hours", () => {
  const t = sumEntries([
    entry({ start: "07:00", end: "17:00", breakMinutes: 60 }), // 9h → 1h OT
    entry({ start: "07:00", end: "18:00", breakMinutes: 60 }), // 10h → 2h OT
    entry({ start: "07:00", end: "15:00", breakMinutes: 60 }), // 7h → none
  ]);
  assert.equal(t.workedMinutes, 26 * H);
  assert.equal(t.overtimeMinutes, 3 * H);
});

test("unknown days are skipped rather than counted as zero", () => {
  const t = sumEntries([
    entry({ start: "07:00", end: "16:00", breakMinutes: 60 }),
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
// The mock data has to contain the cases it claims to, or the screens look
// finished while never showing anything interesting.
// -----------------------------------------------------------------------------
const { MOCK_EMPLOYEES, MOCK_ENTRIES, MOCK_SUBMITTED_DATES } = await import(
  "../src/data/attendance/mockData.ts"
);

console.log("\nMock data");

test("there are enough employees to be worth filtering", () => {
  assert.ok(MOCK_EMPLOYEES.length >= 10, `only ${MOCK_EMPLOYEES.length} employees`);
});

test("no real-looking identifiers leak in", () => {
  for (const e of MOCK_EMPLOYEES) assert.match(e.id, /^CP\d{3}$/);
});

test("nothing is dated in the future", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const e of MOCK_ENTRIES) assert.ok(e.date <= today, `${e.date} is ahead of today`);
});

test("past days are already completed, today is left open to try", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(MOCK_SUBMITTED_DATES.length > 0, "nothing to show in the master sheet");
  assert.ok(!MOCK_SUBMITTED_DATES.includes(today), "today should still be open");
});

test("the sample contains sick, vacation and a missing clock-out", () => {
  assert.ok(MOCK_ENTRIES.some((e) => e.status === "sick"), "no sick day");
  assert.ok(MOCK_ENTRIES.some((e) => e.status === "vacation"), "no vacation day");
  assert.ok(
    MOCK_ENTRIES.some((e) => e.status === "present" && e.start && !e.end),
    "no missing clock-out",
  );
});

test("the sample contains overtime, a short day and a night shift", () => {
  const totals = MOCK_ENTRIES.map((e) => ({ e, t: calculateEntry(e) }));
  assert.ok(totals.some(({ t }) => t.overtimeMinutes > 0), "no overtime");
  assert.ok(
    totals.some(({ t }) => t.workedMinutes !== null && t.workedMinutes < 8 * H && t.workedMinutes > 0),
    "no short day",
  );
  assert.ok(
    MOCK_ENTRIES.some((e) => e.start && e.end && e.end < e.start),
    "no night shift",
  );
});

test("every present entry with both times parses", () => {
  for (const e of MOCK_ENTRIES) {
    if (e.status !== "present" || !e.start || !e.end) continue;
    assert.notEqual(
      calculateEntry(e).workedMinutes,
      null,
      `${e.employeeId} ${e.date} failed to parse`,
    );
  }
});

// -----------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
