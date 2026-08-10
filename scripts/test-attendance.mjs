// =============================================================================
// Attendance calculation tests.
//
//   npm run test:attendance
//
// The engine imports nothing but types, so Node can run the TypeScript directly
// and these are real assertions against the same code the app bundles — not a
// re-implementation that could drift from it.
//
// Every case here comes from the plant's stated rules. If the policy changes,
// these are what should change first.
// =============================================================================
import assert from "node:assert/strict";

import {
  DEFAULT_POLICY,
  calculateDay,
  calculateMonth,
  calculateWeek,
  formatDuration,
  parseTime,
  startOfWeek,
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
/** A day worked from `inAt` for `hours`, with a one-hour break at noon. */
function shift(date, timeIn, timeOut, withBreak = true) {
  return {
    employeeId: "T1",
    date,
    timeIn,
    timeOut,
    ...(withBreak ? { breakStart: "12:00", breakEnd: "13:00" } : {}),
  };
}

/**
 * A realistic day of exactly `hours` worked, starting at 07:00.
 *
 * A shift ending at or before noon has no lunch break — which is what actually
 * happens, and also what stops these fixtures accidentally testing the
 * break-outside-the-shift guard instead of the thing they mean to test.
 */
function worked(date, hours) {
  if (hours <= 0) return null;
  if (hours <= 5) {
    const end = 7 + hours;
    return shift(date, "07:00", `${String(end).padStart(2, "0")}:00`, false);
  }
  const end = 7 + hours + 1; // the hour of lunch sits inside the day
  return shift(date, "07:00", `${String(end).padStart(2, "0")}:00`);
}

// Monday 2026-08-03 .. Sunday 2026-08-09
const MON = "2026-08-03";
const week = weekDates(MON);

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

test("formatDuration renders hours and minutes", () => {
  assert.equal(formatDuration(8 * H), "8h 00m");
  assert.equal(formatDuration(9 * H + 30), "9h 30m");
  assert.equal(formatDuration(7 * H + 45), "7h 45m");
  assert.equal(formatDuration(null), "—");
});

test("weeks run Monday to Sunday, and Sunday belongs to the week before", () => {
  assert.equal(startOfWeek("2026-08-03"), "2026-08-03"); // Monday
  assert.equal(startOfWeek("2026-08-09"), "2026-08-03"); // Sunday
  assert.equal(startOfWeek("2026-08-10"), "2026-08-10"); // next Monday
});

console.log("\nTEST 5 — the break is never counted as worked time");

test("07:00–17:00 with a noon break is 9h, not 10h", () => {
  const day = calculateDay({ date: MON, record: shift(MON, "07:00", "17:00") });
  assert.equal(day.workedMinutes, 9 * H);
  assert.equal(day.breakMinutes, 1 * H);
  assert.equal(day.differenceMinutes, 1 * H, "one hour over the daily target");
});

test("07:00–15:00 with a noon break is 7h", () => {
  const day = calculateDay({ date: MON, record: shift(MON, "07:00", "15:00") });
  assert.equal(day.workedMinutes, 7 * H);
  assert.equal(day.status, "short");
});

test("07:00–18:00 with a noon break is 10h", () => {
  const day = calculateDay({ date: MON, record: shift(MON, "07:00", "18:00") });
  assert.equal(day.workedMinutes, 10 * H);
});

test("no break recorded means nothing is deducted", () => {
  const day = calculateDay({
    date: MON,
    record: shift(MON, "07:00", "15:00", false),
  });
  assert.equal(day.workedMinutes, 8 * H);
  assert.equal(day.status, "normal");
});

test("a break recorded outside the shift cannot remove worked time", () => {
  const day = calculateDay({
    date: MON,
    record: {
      employeeId: "T1",
      date: MON,
      timeIn: "07:00",
      breakStart: "19:00",
      breakEnd: "20:00",
      timeOut: "15:00",
    },
  });
  assert.equal(day.workedMinutes, 8 * H, "the stray break is ignored");
});

console.log("\nTEST 6 — missing times never produce a wrong number");

test("a day with no times at all is unknown, not zero", () => {
  const day = calculateDay({ date: MON });
  assert.equal(day.workedMinutes, null);
  assert.equal(day.differenceMinutes, null);
  assert.equal(day.status, "rest");
});

test("clocked in but never out is missing, not a full day", () => {
  const day = calculateDay({
    date: MON,
    record: { employeeId: "T1", date: MON, timeIn: "07:00" },
  });
  assert.equal(day.workedMinutes, null);
  assert.equal(day.status, "missing");
});

test("a missing working day still owes its eight hours", () => {
  const records = week.slice(0, 5).map((d) => shift(d, "07:00", "16:00"));
  const result = calculateWeek("T1", MON, records); // Saturday absent
  assert.equal(result.daysMissing, 1);
  assert.equal(result.workedMinutes, 40 * H);
  assert.equal(result.shortfallMinutes, 8 * H);
});

test("a night shift crossing midnight is measured, not treated as negative", () => {
  const day = calculateDay({
    date: MON,
    record: {
      employeeId: "T1",
      date: MON,
      timeIn: "19:00",
      breakStart: "23:00",
      breakEnd: "23:30",
      timeOut: "04:00",
    },
  });
  assert.equal(day.overnight, true);
  assert.equal(day.workedMinutes, 8 * H + 30);
});

console.log("\nTEST 1 — six days of exactly eight hours");

test("48 hours worked: no shortfall, no overtime, no compensation", () => {
  const records = week.slice(0, 6).map((d) => shift(d, "07:00", "16:00"));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 48 * H);
  assert.equal(r.normalMinutes, 48 * H);
  assert.equal(r.shortfallMinutes, 0);
  assert.equal(r.overtimeMinutes, 0);
  assert.equal(r.compensationMinutes, 0);
  assert.equal(r.balanceMinutes, 0);
  assert.equal(r.daysWorked, 6);
});

console.log("\nTEST 2 — a short day compensated later in the same week");

test("6h Monday and 10h Tuesday cancel out; the week is square", () => {
  const hours = [6, 10, 8, 8, 8, 8];
  const records = hours.map((h, i) => worked(week[i], h));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 48 * H, "48 hours across the week");
  assert.equal(r.compensationMinutes, 2 * H, "Tuesday's extra covered Monday");
  assert.equal(r.overtimeMinutes, 0, "compensation is not overtime");
  assert.equal(r.shortfallMinutes, 0, "and Monday is no longer short");
  assert.equal(r.balanceMinutes, 0);
});

test("the daily view still shows Monday short and Tuesday over", () => {
  const hours = [6, 10, 8, 8, 8, 8];
  const records = hours.map((h, i) => worked(week[i], h));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.days[0].status, "short");
  assert.equal(r.days[0].differenceMinutes, -2 * H);
  assert.equal(r.days[1].status, "extra");
  assert.equal(r.days[1].differenceMinutes, 2 * H);
});

console.log("\nTEST 3 — 52 hours in the week");

test("48 normal and 4 overtime", () => {
  const hours = [10, 10, 8, 8, 8, 8]; // 52
  const records = hours.map((h, i) => worked(week[i], h));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 52 * H);
  assert.equal(r.normalMinutes, 48 * H);
  assert.equal(r.overtimeMinutes, 4 * H);
  assert.equal(r.compensationMinutes, 0);
  assert.equal(r.shortfallMinutes, 0);
});

test("52 hours with a short day: compensation first, then overtime", () => {
  const hours = [6, 12, 10, 8, 8, 8]; // 52, with 2h to make up
  const records = hours.map((h, i) => worked(week[i], h));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 52 * H);
  assert.equal(r.compensationMinutes, 2 * H, "Monday's 2h shortfall covered");
  assert.equal(r.overtimeMinutes, 4 * H, "the rest is genuine overtime");
  assert.equal(r.shortfallMinutes, 0);
  assert.equal(
    r.compensationMinutes + r.overtimeMinutes,
    6 * H,
    "daily excess is split, never counted twice",
  );
});

console.log("\nTEST 4 — under 48 hours");

test("44 hours leaves a 4 hour shortfall and no overtime", () => {
  const hours = [8, 8, 8, 8, 8, 4];
  const records = hours.map((h, i) => worked(week[i], h));
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 44 * H);
  assert.equal(r.normalMinutes, 44 * H);
  assert.equal(r.shortfallMinutes, 4 * H);
  assert.equal(r.overtimeMinutes, 0);
  assert.equal(r.balanceMinutes, -4 * H);
});

console.log("\nReconciliation — the figures must not overlap");

test("compensation + overtime = total daily excess, on every shape of week", () => {
  const shapes = [
    [8, 8, 8, 8, 8, 8],
    [6, 10, 8, 8, 8, 8],
    [10, 10, 8, 8, 8, 8],
    [6, 12, 10, 8, 8, 8],
    [4, 4, 4, 4, 4, 4],
    [12, 12, 12, 12, 12, 12],
    [0, 8, 8, 8, 8, 8],
  ];
  for (const hours of shapes) {
    const records = hours.map((h, i) => worked(week[i], h)).filter(Boolean);
    const r = calculateWeek("T1", MON, records);

    const excess = r.days.reduce(
      (t, d) => t + Math.max(0, (d.differenceMinutes ?? 0)),
      0,
    );
    assert.equal(
      r.compensationMinutes + r.overtimeMinutes,
      excess,
      `excess split wrong for ${hours}`,
    );
    assert.equal(
      r.workedMinutes - r.targetMinutes,
      r.overtimeMinutes - r.shortfallMinutes,
      `balance disagrees with overtime/shortfall for ${hours}`,
    );
    assert.equal(
      r.normalMinutes,
      Math.min(r.workedMinutes, DEFAULT_POLICY.weeklyTargetMinutes),
      `normal hours wrong for ${hours}`,
    );
  }
});

test("Sunday work is all surplus, since Sunday carries no target", () => {
  const records = [
    ...week.slice(0, 6).map((d) => shift(d, "07:00", "16:00")),
    shift(week[6], "07:00", "12:00", false), // 5h on Sunday
  ];
  const r = calculateWeek("T1", MON, records);
  assert.equal(r.workedMinutes, 53 * H);
  assert.equal(r.overtimeMinutes, 5 * H);
  assert.equal(r.shortfallMinutes, 0);
});

console.log("\nTEST 7 — monthly totals aggregate the weeks");

test("every full week in the month rolls up at 48 normal hours each", () => {
  const records = [];
  for (let w = 0; w < 5; w++) {
    const monday = addDaysLocal("2026-06-01", w * 7);
    for (const d of weekDates(monday).slice(0, 6)) {
      records.push(shift(d, "07:00", "16:00"));
    }
  }
  const m = calculateMonth("T1", "2026-06-01", records);
  assert.equal(m.weeks.length, 5, "June 2026 has five Mondays");
  assert.equal(m.normalMinutes, 5 * 48 * H);
  assert.equal(m.overtimeMinutes, 0);
  assert.equal(m.shortfallMinutes, 0);
  assert.equal(m.daysWorked, 30);
});

function addDaysLocal(iso, days) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test("monthly totals are the sum of their weeks, with nothing invented", () => {
  // All five of June's weeks, so the month is fully accounted for: one long
  // week, one short week, three square ones.
  const perWeek = [9, 7, 8, 8, 8]; // hours per day, six days each
  const records = [];
  perWeek.forEach((hours, w) => {
    const monday = addDaysLocal("2026-06-01", w * 7);
    for (const d of weekDates(monday).slice(0, 6)) records.push(worked(d, hours));
  });

  const m = calculateMonth("T1", "2026-06-01", records);
  assert.equal(m.weeks.length, 5);
  assert.equal(m.workedMinutes, (54 + 42 + 48 * 3) * H);
  assert.equal(m.overtimeMinutes, 6 * H, "the long week only");
  assert.equal(m.shortfallMinutes, 6 * H, "the short week only");
  assert.equal(
    m.normalMinutes,
    (48 + 42 + 48 * 3) * H,
    "normal hours cap at 48 a week; a long week cannot cover a short one",
  );
  assert.equal(m.daysWorked, 30);
});

test("a month counts only the weeks that begin in it", () => {
  // 2026-06-29 is a Monday, so its week runs into July but belongs to June.
  const records = weekDates("2026-06-29")
    .slice(0, 6)
    .map((d) => worked(d, 8));
  const june = calculateMonth("T1", "2026-06-01", records);
  const july = calculateMonth("T1", "2026-07-01", records);

  assert.equal(
    june.weeks.some((w) => w.weekStart === "2026-06-29"),
    true,
    "the week starting 29 June is June's",
  );
  assert.equal(
    july.weeks.some((w) => w.weekStart === "2026-06-29"),
    false,
    "and is not counted again in July",
  );
});

// -----------------------------------------------------------------------------
// The mock data has to actually contain the cases it claims to, or the module
// looks finished while never exercising the interesting arithmetic.
// -----------------------------------------------------------------------------
const { MOCK_EMPLOYEES, MOCK_RECORDS, MOCK_WEEK_STARTS } = await import(
  "../src/data/attendance/mockData.ts"
);

console.log("\nMock data coverage");

const weeklyResults = MOCK_EMPLOYEES.flatMap((e) =>
  MOCK_WEEK_STARTS.map((start) =>
    calculateWeek(
      e.id,
      start,
      MOCK_RECORDS.filter((r) => r.employeeId === e.id),
    ),
  ),
);
// The current week is still running, so it is not a fair sample of a full week.
const completeWeeks = weeklyResults.filter(
  (w) => w.weekStart !== MOCK_WEEK_STARTS[0],
);

test("there are enough employees to be worth filtering", () => {
  assert.ok(
    MOCK_EMPLOYEES.length >= 10,
    `expected at least 10 employees, got ${MOCK_EMPLOYEES.length}`,
  );
});

test("no real-looking identifiers leak in", () => {
  for (const e of MOCK_EMPLOYEES) {
    assert.match(e.id, /^CP\d{3}$/, `${e.id} is not a mock staff number`);
  }
});

const has = (predicate) => completeWeeks.some(predicate);

test("some weeks land on exactly 48 hours", () => {
  assert.ok(has((w) => w.balanceMinutes === 0 && w.daysWorked === 6));
});

test("some weeks finish short", () => {
  assert.ok(has((w) => w.shortfallMinutes > 0));
});

test("some weeks carry genuine overtime", () => {
  assert.ok(has((w) => w.overtimeMinutes > 0));
});

test("some weeks compensate a short day with a long one", () => {
  assert.ok(has((w) => w.compensationMinutes > 0 && w.overtimeMinutes === 0));
});

test("some weeks do both — compensation and overtime", () => {
  assert.ok(has((w) => w.compensationMinutes > 0 && w.overtimeMinutes > 0));
});

test("some days are missing a clock-out", () => {
  assert.ok(has((w) => w.daysMissing > 0));
});

test("some shifts run through midnight", () => {
  assert.ok(
    completeWeeks.some((w) => w.days.some((d) => d.overnight)),
    "no night shifts in the mock data",
  );
});

test("every record parses — no unreadable mock times", () => {
  for (const week of weeklyResults) {
    for (const day of week.days) {
      if (!day.record) continue;
      const incomplete = !day.record.timeIn || !day.record.timeOut;
      assert.equal(
        day.workedMinutes === null,
        incomplete,
        `${day.date} ${week.employeeId}: a complete record failed to parse`,
      );
    }
  }
});

test("nothing is dated in the future", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const record of MOCK_RECORDS) {
    assert.ok(record.date <= today, `${record.date} is in the future`);
  }
});

// -----------------------------------------------------------------------------
console.log(
  `\n${passed} passed, ${failures.length} failed\n`,
);
if (failures.length) {
  for (const f of failures) console.error(`  ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
