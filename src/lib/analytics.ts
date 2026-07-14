import { parseISO, isWithinInterval, startOfDay } from "date-fns";
import type { Report } from "@/types";
import { computeTotals } from "@/lib/calculations";

export interface TrendPoint {
  /** Allows the point to be consumed by generic chart components. */
  [key: string]: string | number;
  date: string;
  label: string;
  currentStock: number;
  production: number;
  sales: number;
  bags50kg: number;
  jumbo: number;
  totalCementMt: number;
  emptyBags: number;
}

/** Build an ascending-by-date series with all derived metrics per report. */
export function buildTrend(reports: Report[]): TrendPoint[] {
  return reports
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const t = computeTotals(r.data);
      const d = parseISO(r.date);
      return {
        date: r.date,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        currentStock: Math.round(r.data.silo.currentStock),
        production: Math.round(r.data.silo.production),
        sales: Math.round(r.data.silo.sales),
        bags50kg: t.total50kgBags,
        jumbo: t.totalJumboBags,
        totalCementMt: Math.round(t.totalCementMt),
        emptyBags: t.totalEmptyBags,
      };
    });
}

export interface DateRange {
  from: Date;
  to: Date;
}

export function filterByRange(reports: Report[], range: DateRange): Report[] {
  const from = startOfDay(range.from);
  const to = startOfDay(range.to);
  return reports.filter((r) =>
    isWithinInterval(startOfDay(parseISO(r.date)), { start: from, end: to }),
  );
}

/** Percentage change between the two most recent points of a numeric series. */
export function deltaPct(series: number[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const curr = series[series.length - 1];
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
