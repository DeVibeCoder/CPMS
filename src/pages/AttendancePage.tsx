import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageMeta } from "@/store/pageMeta";
import { useTimesheets } from "@/components/attendance/useTimesheets";
import { MockDataNotice } from "@/components/attendance/shared";
import { EmployeesTab } from "@/components/attendance/EmployeesTab";
import { TimeSheetTab } from "@/components/attendance/TimeSheetTab";
import { MasterTab } from "@/components/attendance/MasterTab";
import { OrgChartTab } from "@/components/attendance/OrgChartTab";

/**
 * Attendance — staff working hours.
 *
 * Under development and administrator-only. Nothing here reads or writes the
 * plant's reports, Supabase, or any HR system: a first visit loads an invented
 * plant from `src/data/attendance` — staff, departures, timesheets and chart
 * assignments — and everything entered on top of it is kept in the browser's
 * local storage. That is enough to trial the module and is not a backend — one
 * machine, one browser, gone if site data is cleared.
 *
 * The seam that will eventually carry real data is `attendanceSource`, and
 * swapping it is meant to leave every component on this page untouched.
 *
 * Four tabs, in the order the work happens: who the staff are, the day being
 * filled in, the completed days everybody reads figures off, and the chart of
 * who holds which post.
 */
const TAB_KEY = "cpsm.attendance.tab";

const TABS = [
  { value: "employees", label: "Employees" },
  { value: "timesheet", label: "Time Sheet" },
  { value: "master", label: "Master" },
  { value: "org", label: "Org Chart" },
];

/**
 * Which tab is open, remembered for the session.
 *
 * Held outside the component because this page is remounted more often than it
 * looks: coming back from the print dialog, following a link back to
 * Attendance, or any re-render of the route above it. Every one of those threw
 * away a plain `useState` and dropped somebody who was working on the org chart
 * back onto the staff list.
 *
 * Session storage rather than local: "carry on where I was" is true for an
 * afternoon's work and false a week later, when opening on the staff list is
 * the more useful default again.
 *
 * Employees is that default. The staff list is what a plant has to fill in
 * before the timesheet has anything to be filled in against.
 */
function useOpenTab(): [string, (value: string) => void] {
  const [tab, setTab] = useState(() => {
    try {
      const stored = sessionStorage.getItem(TAB_KEY);
      if (stored && TABS.some((t) => t.value === stored)) return stored;
    } catch {
      /* storage disabled — the default is no worse than before */
    }
    return "employees";
  });

  const choose = useCallback((value: string) => {
    setTab(value);
    try {
      sessionStorage.setItem(TAB_KEY, value);
    } catch {
      /* nothing to do; the tab still changes, it just will not be remembered */
    }
  }, []);

  return [tab, choose];
}

export default function AttendancePage() {
  usePageMeta("Attendance", "Staff working hours — under development");
  const sheets = useTimesheets();
  const [tab, setTab] = useOpenTab();
  const [date, setDate] = useState<string | null>(null);

  if (sheets.error) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <p className="font-medium">Could not load attendance</p>
          <p className="text-sm text-muted-foreground">{sheets.error}</p>
        </CardContent>
      </Card>
    );
  }

  if (sheets.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MockDataNotice onReset={sheets.reset} />

      <Tabs value={tab} onValueChange={setTab}>
        {/* The active tab takes the app's primary colour rather than the
            default plain white card. Both are theme tokens, so the light and
            dark palettes each supply their own pair and the contrast between
            them holds without a second rule here. */}
        <div className="overflow-x-auto scrollbar-none">
          <TabsList className="bg-primary/10 dark:bg-primary/[0.14]">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="text-primary/70 hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="employees">
          <EmployeesTab sheets={sheets} />
        </TabsContent>
        <TabsContent value="timesheet">
          <TimeSheetTab
            sheets={sheets}
            date={date ?? sheets.today}
            onDateChange={setDate}
          />
        </TabsContent>
        <TabsContent value="master">
          <MasterTab sheets={sheets} />
        </TabsContent>
        <TabsContent value="org">
          <OrgChartTab sheets={sheets} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
