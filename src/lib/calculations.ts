import type { ReportData, EmptyBagGroup } from "@/types";
import { sum } from "@/lib/utils";

export function groupTotal(g: EmptyBagGroup): number {
  return sum([g.plant01, g.plant02, g.plant03, g.gStore]);
}

/**
 * Derived totals for a report. Everything here is auto-calculated — no manual
 * total is ever stored, so a report can never contain an inconsistent sum.
 *
 * The one figure that is *entered* rather than derived is the jumbo Total
 * Cement (MT): on the master report it is not a clean multiple of the bag
 * count, so it is captured directly and surfaced here for convenience.
 */
export interface ReportTotals {
  /** Section 1 — total 50kg bags across all locations (unit: Bags). */
  total50kgBags: number;
  /** Section 2 — total jumbo bags counted. */
  totalJumboBags: number;
  /** Section 2 — jumbo cement tonnage in MT (entered on the report). */
  totalCementMt: number;

  /** Section 4 — China empties total. */
  chinaTotal: number;
  /** Section 4 — Indonesia empties total. */
  indonesiaTotal: number;
  /** Section 4 — all 50kg empty bags. */
  totalEmptyBags: number;

  /** Section 5 — total empty jumbo bags. */
  totalEmptyJumbo: number;

  /** Section 6 — New net slings total. */
  newSlingTotal: number;
  /** Section 6 — Used net slings total. */
  usedSlingTotal: number;
  /** Section 6 — all net slings. */
  totalNetSlings: number;
}

export function computeTotals(d: ReportData): ReportTotals {
  const total50kgBags = sum([
    d.bags50kg.cementJetty,
    d.bags50kg.godown,
    d.bags50kg.qMarineJetty,
  ]);

  const chinaTotal = groupTotal(d.emptyBags50kg.china);
  const indonesiaTotal = groupTotal(d.emptyBags50kg.indonesia);
  const totalEmptyBags = chinaTotal + indonesiaTotal;

  const totalEmptyJumbo = sum([
    d.emptyJumbo.cementGodown,
    d.emptyJumbo.cementJetty,
    d.emptyJumbo.gStore,
  ]);

  const newSlingTotal = sum([d.netSlings.new.cementGodown, d.netSlings.new.gStore]);
  const usedSlingTotal = sum([
    d.netSlings.used.cementGodown,
    d.netSlings.used.gStore,
  ]);

  return {
    total50kgBags,
    totalJumboBags: d.jumbo.cementJetty,
    totalCementMt: d.jumbo.totalCementMt,
    chinaTotal,
    indonesiaTotal,
    totalEmptyBags,
    totalEmptyJumbo,
    newSlingTotal,
    usedSlingTotal,
    totalNetSlings: newSlingTotal + usedSlingTotal,
  };
}

/** A fresh, zeroed report data object for new reports. */
export function emptyReportData(): ReportData {
  const emptyGroup = (): EmptyBagGroup => ({
    plant01: 0,
    plant02: 0,
    plant03: 0,
    gStore: 0,
  });
  return {
    bags50kg: { cementJetty: 0, godown: 0, qMarineJetty: 0 },
    jumbo: { cementJetty: 0, totalCementMt: 0 },
    silo: { currentStock: 0, sales: 0, production: 0 },
    emptyBags50kg: { china: emptyGroup(), indonesia: emptyGroup() },
    emptyJumbo: { cementGodown: 0, cementJetty: 0, gStore: 0 },
    netSlings: {
      new: { cementGodown: 0, gStore: 0 },
      used: { cementGodown: 0, gStore: 0 },
    },
    notes: "",
  };
}
