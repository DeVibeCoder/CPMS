import { create } from "zustand";

/**
 * Month/year selection for Report History.
 *
 * Kept outside the page component on purpose: opening a report unmounts the
 * list, and a clerk working through, say, March should come back to March
 * rather than being thrown to the current month every time.
 */
interface ReportFiltersState {
  /** Month index as a string, or "all". */
  month: string;
  /** Four-digit year, or "all". */
  year: string;
  setMonth: (v: string) => void;
  setYear: (v: string) => void;
}

export const useReportFilters = create<ReportFiltersState>((set) => ({
  // Defaults to the current month so today's reporting period is shown first.
  month: String(new Date().getMonth()),
  year: "all",
  setMonth: (month) => set({ month }),
  setYear: (year) => set({ year }),
}));
