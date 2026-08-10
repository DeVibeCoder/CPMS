import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageMeta } from "@/store/pageMeta";
import { useTimesheets } from "@/components/attendance/useTimesheets";
import { MockDataNotice } from "@/components/attendance/shared";
import { EmployeesTab } from "@/components/attendance/EmployeesTab";
import { TimeSheetTab } from "@/components/attendance/TimeSheetTab";
import { MasterTab } from "@/components/attendance/MasterTab";

/**
 * Attendance — staff working hours.
 *
 * Under development and administrator-only. It runs entirely on mock data from
 * `src/data/attendance`; nothing here reads or writes the plant's reports,
 * Supabase, or any staff record. The seam that will eventually carry real data
 * is `attendanceSource`, and swapping it is meant to leave every component on
 * this page untouched.
 *
 * Three tabs, in the order the work happens: who the staff are, the day being
 * filled in, and the completed days everybody reads figures off.
 */
export default function AttendancePage() {
  usePageMeta("Attendance", "Staff working hours — under development");
  const sheets = useTimesheets();
  const [tab, setTab] = useState("timesheet");
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
      <MockDataNotice />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto scrollbar-none">
          <TabsList>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="timesheet">Time Sheet</TabsTrigger>
            <TabsTrigger value="master">Master</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
