import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useReportFilters } from "@/store/reportFilters";

/**
 * Pathless layout route around every `/reports` screen.
 *
 * It exists to bound the lifetime of the Report History view, so that opening a
 * report, printing it or duplicating it keeps the month, year, search, sort and
 * page you were working in, and leaving the section altogether puts all of them
 * back to the default view on the current month.
 *
 * AppLayout re-keys the page on every pathname, so this unmounts between the
 * screens inside the section too. Unmounting alone therefore does not mean
 * leaving: the reset has to look at where the router has already gone.
 */
export function ReportsScope() {
  const reset = useReportFilters((s) => s.reset);

  useEffect(
    () => () => {
      const { pathname } = window.location;
      if (pathname !== "/reports" && !pathname.startsWith("/reports/")) reset();
    },
    [reset],
  );

  return <Outlet />;
}
