// =============================================================================
// Cement bin card tests.
//
//   npm run test:bincard
//
// The bin card imports nothing but types, so Node runs the same TypeScript the
// app bundles. No network and no database: every figure here is a small
// synthetic fixture.
// =============================================================================
import assert from "node:assert/strict";

import {
  buildBinCard,
  hasVariance,
  summariseBinCard,
} from "../src/lib/binCard.ts";

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

const round2 = (n) => Math.round(n * 100) / 100;

const report = (date, currentStock, production, over = {}) => ({
  id: `r-${date}`,
  date,
  status: "final",
  data: {
    silo: { currentStock, production, sales: 0, ...over.silo },
    // Everything else on a report is other stock, and must not reach the card.
    bags50kg: { cementJetty: 999, godown: 999, qMarineJetty: 999 },
    jumbo: { cementJetty: 999, totalCementMt: 999 },
  },
  ...over,
});
const shipment = (date, amountMt) => ({ id: `s-${date}`, date, amountMt });

const card = (reports, shipments = [], openingBalance = 1000) =>
  buildBinCard({
    reports,
    shipments,
    openingBalance,
    openingDate: "2026-07-01",
  });

console.log("\nCarrying the balance");

test("a clean run closes on the reports and shows no variance", () => {
  const rows = card([report("2026-07-01", 900, 100), report("2026-07-02", 850, 50)]);
  assert.deepEqual(
    rows.map((r) => [r.openingBalance, r.currentBalance, r.variance]),
    [
      [1000, 900, 0],
      [900, 850, 0],
    ],
  );
});

test("each day opens on the previous day's close, even after a variance", () => {
  const rows = card([
    report("2026-07-01", 880, 100),
    report("2026-07-02", 830, 50),
  ]);
  assert.equal(rows[1].openingBalance, rows[0].currentBalance);
});

test("a gap in the movements is shown once and not carried forward", () => {
  const rows = card([
    report("2026-07-01", 880, 100), // the report sits 20 below the sum
    report("2026-07-02", 830, 50),
    report("2026-07-03", 800, 30),
  ]);
  assert.deepEqual(
    rows.map((r) => r.variance),
    [-20, 0, 0],
  );
  assert.equal(rows[2].currentBalance, 800);
});

test("the earliest bad day is the one flagged", () => {
  const rows = card([
    report("2026-07-01", 900, 100),
    report("2026-07-02", 845, 50),
    report("2026-07-03", 815, 30),
  ]);
  assert.deepEqual(
    rows.filter(hasVariance).map((r) => r.date),
    ["2026-07-02"],
  );
});

test("a one-day typing slip in the stock is flagged and then reverses", () => {
  const rows = card([
    report("2026-07-01", 900, 100),
    report("2026-07-02", 855, 50), // should be 850
    report("2026-07-03", 800, 50),
  ]);
  assert.deepEqual(
    rows.map((r) => r.variance),
    [0, 5, -5],
  );
  assert.equal(rows[2].currentBalance, 800);
});

test("rounding of a cent or two is not reported as a variance", () => {
  const rows = card([report("2026-07-01", 899.99, 100)]);
  assert.equal(rows[0].variance, -0.01);
  assert.equal(hasVariance(rows[0]), false);
});

test("closing balance = opening + shipments − production + variances", () => {
  const rows = card(
    [
      report("2026-07-01", 880, 100),
      report("2026-07-02", 1825.5, 54.5, { silo: { newShipment: 1000 } }),
      report("2026-07-03", 1800, 30),
    ],
    [],
  );
  const total = rows.reduce(
    (a, r) => a + r.newShipment - r.production + r.variance,
    1000,
  );
  assert.equal(round2(total), rows[rows.length - 1].currentBalance);
});

console.log("\nShipments and production");

test("a date's shipment is counted once when report and ledger both hold it", () => {
  const rows = card(
    [report("2026-07-01", 1900, 100, { silo: { newShipment: 1000 } })],
    [shipment("2026-07-01", 1000)],
  );
  assert.equal(rows[0].newShipment, 1000);
  assert.equal(rows[0].variance, 0);
  assert.equal(summariseBinCard(rows, 1000, "2026-07-01").totalShipments, 1000);
});

test("a figure only on the report is still counted, and marked as legacy", () => {
  const rows = card([
    report("2026-07-01", 1900, 100, { silo: { newShipment: 1000 } }),
  ]);
  assert.equal(rows[0].newShipment, 1000);
  assert.equal(rows[0].legacyShipment, true);
});

test("a shipment with no report yet moves the balance straight away", () => {
  const rows = card(
    [report("2026-07-01", 900, 100)],
    [shipment("2026-07-02", 500)],
  );
  assert.equal(rows[1].currentBalance, 1400);
  assert.equal(rows[1].variance, 0);
  assert.equal(rows[1].reportId, undefined);
});

test("a shipment on a report's date that the stock has not caught up with", () => {
  // Logged against the vessel's date, but the report balance took it in later.
  // Two flags that cancel, not a lost 500.
  const rows = card(
    [report("2026-07-01", 900, 100), report("2026-07-02", 1300, 100)],
    [shipment("2026-07-01", 500)],
  );
  assert.deepEqual(
    rows.map((r) => r.variance),
    [-500, 500],
  );
  assert.equal(rows[1].currentBalance, 1300);
});

test("production is taken once per report date", () => {
  const rows = card([report("2026-07-01", 900, 100)]);
  assert.equal(summariseBinCard(rows, 1000, "2026-07-01").totalProduction, 100);
});

console.log("\nDrafts, reopening and edge cases");

test("a draft moves nothing", () => {
  const rows = card([
    report("2026-07-01", 900, 100),
    report("2026-07-02", 1, 899, { status: "draft" }),
  ]);
  assert.equal(rows.length, 1);
});

test("reverting a final report and finalising it again gives the same card", () => {
  const first = report("2026-07-01", 900, 100);
  const second = report("2026-07-02", 800, 100);
  const third = report("2026-07-03", 700, 100);
  const before = card([first, second, third]);
  const reverted = card([first, { ...second, status: "draft" }, third]);
  assert.equal(reverted.length, 2);
  assert.equal(reverted[1].currentBalance, 700);
  assert.deepEqual(card([first, second, third]), before);
});

test("a report with no stock figure falls back to the sum, not to zero", () => {
  const rows = card([
    report("2026-07-01", 900, 100),
    report("2026-07-02", 0, 50),
  ]);
  assert.equal(rows[1].currentBalance, 850);
  assert.equal(rows[1].variance, 0);
});

test("records before the opening date are ignored", () => {
  const rows = card([report("2026-06-30", 5, 5), report("2026-07-01", 900, 100)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-07-01");
});

test("input order does not matter", () => {
  const a = report("2026-07-01", 900, 100);
  const b = report("2026-07-02", 850, 50);
  assert.deepEqual(card([b, a]), card([a, b]));
});

test("building the card does not change the reports it is given", () => {
  const reports = [report("2026-07-01", 880, 100)];
  const copy = structuredClone(reports);
  card(reports);
  assert.deepEqual(reports, copy);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`FAIL ${f.name}\n     ${f.message}\n`);
if (failures.length) process.exitCode = 1;
