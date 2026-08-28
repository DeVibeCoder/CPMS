// =============================================================================
// Attendance schema — acceptance checks against the live project.
//
//   npm run test:attendance-db
//
// Run this after `npm run db:migrate` has applied the attendance migration. It
// answers the two questions that matter about a table nobody has used yet: is it
// actually there, and can the wrong person reach it.
//
// The rules the schema is supposed to enforce are checked by trying to break
// them — an exit with a return date, a spell that ends before it starts, one
// person in two posts. A constraint nobody has ever tripped is a constraint
// nobody knows works.
//
// It creates its own employee, keyed with a prefix no plant would use, and
// deletes it at the end. Nothing else in the database is touched.
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  requireEnv(
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );

const admin = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const TABLES = [
  "attendance_employees",
  "attendance_departures",
  "attendance_entries",
  "attendance_days",
  "attendance_chart",
];

/** Distinctive enough that a row left behind by a crash is obviously ours. */
const WHO = `ZZ-SCHEMA-CHECK-${Date.now().toString(36).toUpperCase()}`;
const DAY = "2001-01-01";
const SLOT = "zz-schema-check-slot";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log(`  FAIL  ${name}`);
  }
}

const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Assert a write was refused, and say what got through if it was not. */
async function refused(what, run) {
  const { error } = await run();
  ok(error, `${what} was allowed when it should have been refused`);
}

console.log(`\nAttendance schema → ${new URL(VITE_SUPABASE_URL).hostname}\n`);

// -----------------------------------------------------------------------------
console.log("Tables");

for (const table of TABLES) {
  await test(`${table} exists`, async () => {
    const { error } = await admin.from(table).select("*").limit(1);
    ok(
      !error,
      `${error?.message ?? ""} — has the attendance migration been applied?`,
    );
  });
}

// -----------------------------------------------------------------------------
console.log("\nReach");

for (const table of TABLES) {
  await test(`${table} is closed to anon`, async () => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    // Either barrier is enough on its own, and the schema has both: the grant
    // was revoked from anon, and no policy names that role.
    ok(
      error || (data ?? []).length === 0,
      "an unauthenticated client read attendance rows",
    );
  });
}

await test("anon cannot write either", async () => {
  await refused("an anonymous insert", () =>
    anon.from("attendance_employees").insert({
      id: `${WHO}-ANON`,
      name: "ANON",
      department: "CEMENT PLANT",
      position: "NONE",
    }),
  );
});

// -----------------------------------------------------------------------------
console.log("\nRules");

await test("an employee can be created", async () => {
  const { error } = await admin.from("attendance_employees").insert({
    id: WHO,
    name: "SCHEMA CHECK",
    department: "CEMENT PLANT",
    position: "NONE",
  });
  ok(!error, error?.message);
});

await test("an exit cannot carry a return date", async () => {
  await refused("an exit with a To date", () =>
    admin.from("attendance_departures").insert({
      employee_id: WHO,
      type: "exit",
      from_date: DAY,
      to_date: "2001-02-01",
    }),
  );
});

await test("a spell cannot end before it starts", async () => {
  await refused("a backwards date range", () =>
    admin.from("attendance_departures").insert({
      employee_id: WHO,
      type: "vacation",
      from_date: "2001-02-01",
      to_date: DAY,
    }),
  );
});

await test("a departure type outside the four is refused", async () => {
  await refused("an invented departure type", () =>
    admin
      .from("attendance_departures")
      .insert({ employee_id: WHO, type: "sabbatical", from_date: DAY }),
  );
});

await test("a time that is not a clock time is refused", async () => {
  await refused("25:00 as a start time", () =>
    admin.from("attendance_entries").insert({
      employee_id: WHO,
      date: DAY,
      start_time: "25:00",
      status: "present",
    }),
  );
});

await test("one person cannot have two rows for one day", async () => {
  const row = { employee_id: WHO, date: DAY, status: "present" };
  const first = await admin.from("attendance_entries").insert(row);
  ok(!first.error, first.error?.message);
  await refused("a second row for the same day", () =>
    admin.from("attendance_entries").insert(row),
  );
});

await test("the same day upserts rather than duplicating", async () => {
  const { error } = await admin
    .from("attendance_entries")
    .upsert({
      employee_id: WHO,
      date: DAY,
      status: "present",
      start_time: "07:00",
    });
  ok(!error, error?.message);

  const { data } = await admin
    .from("attendance_entries")
    .select("start_time")
    .eq("employee_id", WHO);
  ok(data?.length === 1, `expected one row, found ${data?.length}`);
  ok(data[0].start_time === "07:00", "the upsert did not take");
});

await test("a timesheet row cannot name somebody who does not exist", async () => {
  await refused("a row against an unknown staff number", () =>
    admin
      .from("attendance_entries")
      .insert({ employee_id: `${WHO}-NOBODY`, date: DAY, status: "present" }),
  );
});

await test("one person holds one post", async () => {
  const first = await admin
    .from("attendance_chart")
    .insert({ slot_id: SLOT, employee_id: WHO });
  ok(!first.error, first.error?.message);
  await refused("the same person in a second post", () =>
    admin
      .from("attendance_chart")
      .insert({ slot_id: `${SLOT}-2`, employee_id: WHO }),
  );
});

// -----------------------------------------------------------------------------
console.log("\nCascade");

await test("deleting an employee takes everything keyed to them", async () => {
  const { error } = await admin
    .from("attendance_employees")
    .delete()
    .eq("id", WHO);
  ok(!error, error?.message);

  for (const [table, column] of [
    ["attendance_entries", "employee_id"],
    ["attendance_departures", "employee_id"],
    ["attendance_chart", "employee_id"],
  ]) {
    const { data } = await admin.from(table).select("*").eq(column, WHO);
    ok((data ?? []).length === 0, `${table} kept a row after the cascade`);
  }
});

// -----------------------------------------------------------------------------
// Whatever happened above, leave nothing behind.
// -----------------------------------------------------------------------------
await admin.from("attendance_chart").delete().eq("employee_id", WHO);
await admin.from("attendance_entries").delete().eq("employee_id", WHO);
await admin.from("attendance_departures").delete().eq("employee_id", WHO);
await admin.from("attendance_employees").delete().like("id", `${WHO}%`);

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ${f.name}\n    ${f.message}\n`);
  process.exit(1);
}
