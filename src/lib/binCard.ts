import type { Report } from "@/types";

/**
 * The cement bin card.
 *
 * A running stock ledger in the shape of a warehouse bin card:
 *
 *     Current Balance = Opening Balance + New Shipment − Production
 *     next day's Opening Balance = this day's Current Balance
 *
 * Only the very first opening balance is entered by hand. Everything after it is
 * derived here from **finalised** reports, so the figures on this page can never
 * disagree with the reports they came from, and nobody is asked to carry a
 * balance forward manually.
 *
 * Pure by design — records in, rows out, no I/O.
 */

export interface BinCardRow {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  openingBalance: number;
  newShipment: number;
  production: number
  currentBalance: number;
  /** Report this row was derived from, for the "view report" link. */
  reportId?: string;
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
  /** The manually entered starting balance, in MT. */
  openingBalance: number;
  /** ISO date the opening balance applies to. Rows before it are ignored. */
  openingDate: string;
}

/**
 * Build the bin card, oldest first.
 *
 * Draft reports are skipped entirely rather than contributing zeroes: a day
 * whose report is still being written has no settled figures, and showing it as
 * "0 produced" would understate consumption and mislead the balance forward.
 */
export function buildBinCard({
  reports,
  openingBalance,
  openingDate,
}: BinCardInput): BinCardRow[] {
  const finalised = reports
    .filter(isFinal)
    .filter((r) => r.date >= openingDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const rows: BinCardRow[] = [];
  let carried = round2(openingBalance);

  for (const [index, report] of finalised.entries()) {
    const newShipment = round2(report.data.silo?.newShipment ?? 0);
    const production = round2(report.data.silo?.production ?? 0);
    const opening = carried;
    const currentBalance = round2(opening + newShipment - production);

    rows.push({
      date: report.date,
      openingBalance: opening,
      newShipment,
      production,
      currentBalance,
      reportId: report.id,
      isAnchor: index === 0,
    });
    carried = currentBalance;
  }

  return rows;
}

export interface BinCardSummary {
  /** Balance after the most recent finalised report. */
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
 * out of the most recent finalised day strictly before it.
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
