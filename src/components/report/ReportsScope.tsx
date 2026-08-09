import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useReportFilters } from "@/store/reportFilters";

/**
 * Pathless layout route around every `/reports` screen.
 *
 * It exists to bound the lifetime of the Report History month filter. Because
 * it wraps the list, the editor and the viewer alike, it stays mounted while
 * you move between them — so opening a report, printing it or duplicating it
 * keeps the month you were working in. It unmounts only when you leave the
 * section altogether (or sign out), and that is where the filter goes back to
 * the current month.
 *
 * Expressing it as a route boundary rather than by comparing pathnames means
 * the rule cannot drift: any screen added under `/reports` is inside the scope
 * by construction, and anything outside it is not.
 */
export function ReportsScope() {
  const reset = useReportFilters((s) => s.reset);

  useEffect(() => reset, [reset]);

  return <Outlet />;
}
