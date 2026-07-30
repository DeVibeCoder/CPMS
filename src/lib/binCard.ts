import type { Report, Shipment } from "@/types";

/**
 * The cement bin card.
 *
 * A running stock ledger in the shape of a warehouse bin card:
 *
 *     Current Balance = Opening Balance + New Shipment − Production
 *     next day's Opening Balance = this day's Current Balance
 *
 * Two sources feed it. Production comes from **finalised** reports, so the
 * figures here can never disagree with the reports they came from. Shipments
 * come from the shipments ledger, which is independent of the reporting cycle —
 * cement received today shows on the card today, whether or not that day's
 * report has been written.
 *
 * Only the very first opening balance is entered by hand. Everything after it is
 * derived, so nobody is asked to carry a balance forward manually.
 *
 * Pure by design — records in, rows out, no I/O.
 */

export interface BinCardRow {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  openingBalance: number;
  newShipment: number;
  production: number;
  currentBalance: number;
  /** Report this row's production came from, for the "view report" link. */
  reportId?: string;
  /** Shipment record backing this row's New Shipment, when there is one. */
  shipmentId?: string;
  /**
   * True when New Shipment came from the report's own `silo.newShipment` rather
   * than from a shipment record — i.e. a figure entered before the shipments
   * ledger existed. The UI uses it to explain why the cell is not editable.
   */
  legacyShipment: boolean;
  /**
   * True for the first row, whose opening balance was typed in rather than
   * carried forward. The UI marks it so the manual figure is never mistaken for
   * a derived one.
   */
  isAnchor: boolean;
}

/** Round to 2dp so a long chain of additions cannot accumulate float dust. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** A report only moves stock once it has been finalised. */
export function isFinal(report: Report): boolean {
  return report.status === "final";
}

export interface BinCardInput {
  reports: Report[];
  /** The shipments ledger. Absent is treated as empty. */
  shipments?: Shipment[];
  /** The manually entered starting balance, in MT. */
  openingBalance: number;
  /** ISO date the opening balance applies to. Rows before it are ignored. */
  openingDate: string;
}

/**
 * Build the bin card, oldest first.
 *
 * A row exists for any date on or after the opening date that has a finalised
 * report, a shipment, or both.
 *
 * Draft reports are skipped rather than contributing zeroes: a day whose report
 * is still being written has no settled figures, and showing it as "0 produced"
 * would understate consumption and mislead the balance forward. A shipment on
 * such a day still gets its own row — the cement did arrive — it simply carries
 * no production until the report is finalised.
 *
 * A date's New Shipment is its shipment record if it has one, and otherwise the
 * `silo.newShipment` written on its finalised report. Never both, so a figure
 * that was entered on a report before the shipments ledger existed is counted
 * exactly once.
 */
export function buildBinCard({
  reports,
  shipments = [],
  openingBalance,
  openingDate,
}: BinCardInput): BinCardRow[] {
  const finalised = new Map(
    reports
      .filter(isFinal)
      .filter((r) => r.date >= openingDate)
      .map((r) => [r.date, r]),
  );

  const received = new Map(
    shipments.filter((s) => s.date >= openingDate).map((s) => [s.date, s]),
  );

  const dates = Array.from(
    new Set([...finalised.keys(), ...received.keys()]),
  ).sort((a, b) => a.localeCompare(b));

  const rows: BinCardRow[] = [];
  let carried = round2(openingBalance);

  for (const [index, date] of dates.entries()) {
    const report = finalised.get(date);
    const shipment = received.get(date);

    const legacyShipment = !shipment && (report?.data.silo?.newShipment ?? 0) > 0;
    const newShipment = round2(
      shipment ? shipment.amountMt : (report?.data.silo?.newShipment ?? 0),
    );
    const production = round2(report?.data.silo?.production ?? 0);
    const opening = carried;
    const currentBalance = round2(opening + newShipment - production);

    rows.push({
      date,
      openingBalance: opening,
      newShipment,
      production,
      currentBalance,
      reportId: report?.id,
      shipmentId: shipment?.id,
      legacyShipment,
      isAnchor: index === 0,
    });
    carried = currentBalance;
  }

  return rows;
}

export interface BinCardSummary {
  /** Balance after the most recent row. */
  currentBalance: number;
  /** The date that balance is as at, or the anchor date when there are no rows. */
  asAt: string;
  totalShipments: number;
  totalProduction: number;
  rowCount: number;
}

export function summariseBinCard(
  rows: BinCardRow[],
  openingBalance: number,
  openingDate: string,
): BinCardSummary {
  const last = rows[rows.length - 1];
  return {
    currentBalance: last ? last.currentBalance : round2(openingBalance),
    asAt: last ? last.date : openingDate,
    totalShipments: round2(rows.reduce((a, r) => a + r.newShipment, 0)),
    totalProduction: round2(rows.reduce((a, r) => a + r.production, 0)),
    rowCount: rows.length,
  };
}

/**
 * The opening balance a report on `date` should start from — the balance carried
 * out of the most recent row strictly before it.
 *
 * Used by the report form to show today's opening figure without the operator
 * having to look it up.
 */
export function openingBalanceOn(
  rows: BinCardRow[],
  date: string,
  fallback: number,
): number {
  let opening = round2(fallback);
  for (const row of rows) {
    if (row.date >= date) break;
    opening = row.currentBalance;
  }
  return opening;
}
