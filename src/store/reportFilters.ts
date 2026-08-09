import { create } from "zustand";

/**
 * Month/year selection for Report History.
 *
 * Lives outside the page component because opening a report unmounts the list:
 * a clerk working through March should come back to March after viewing,
 * printing or duplicating a day, not be thrown to the current month each time.
 *
 * It is deliberately *not* persisted, and its lifetime is scoped to a visit to
 * the Reports section — see ReportsScope, which resets it on the way out. The
 * current month is the resting state of this screen, so anything that counts as
 * arriving fresh (a reload, a new sign-in, or coming back from another section)
 * starts there again.
 */
interface ReportFiltersState {
  /** Month index as a string, or "all". */
  month: string;
  /** Four-digit year, or "all". */
  year: string;
  setMonth: (v: string) => void;
  setYear: (v: string) => void;
  /** Return to the default view: the current month, across all years. */
  reset: () => void;
}

/**
 * Computed on each call rather than captured once at module load — the plant
 * leaves this open for days, and a browser sitting through midnight on the 31st
 * would otherwise keep defaulting to a month that has ended.
 */
const defaults = () => ({ month: String(new Date().getMonth()), year: "all" });

export const useReportFilters = create<ReportFiltersState>((set) => ({
  ...defaults(),
  setMonth: (month) => set({ month }),
  setYear: (year) => set({ year }),
  reset: () => set(defaults()),
}));
