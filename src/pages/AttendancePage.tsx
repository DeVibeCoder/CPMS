import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageMeta } from "@/store/pageMeta";
import { useAttendance } from "@/components/attendance/useAttendance";
import { MockDataNotice } from "@/components/attendance/shared";
import { WeeklyTab } from "@/components/attendance/WeeklyTab";
import { MonthlyTab } from "@/components/attendance/MonthlyTab";
import { EmployeeTab } from "@/components/attendance/EmployeeTab";
import { RulesTab } from "@/components/attendance/RulesTab";

/**
 * Attendance — staff working hours.
 *
 * Under development and administrator-only. It runs entirely on mock data from
 * `src/data/attendance`; nothing here reads or writes the plant's reports,
 * Supabase, or any staff record. The seam that will eventually carry real data
 * is `attendanceSource`, and swapping it is meant to leave every component on
 * this page untouched.
 */
export default function AttendancePage() {
  usePageMeta("Attendance", "Staff working hours — under development");
  const data = useAttendance();
  const [tab, setTab] = useState("weekly");

  if (data.error) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <p className="font-medium">Could not load attendance</p>
          <p className="text-sm text-muted-foreground">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MockDataNotice />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto scrollbar-none">
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="employee">Employee</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="weekly">
          <WeeklyTab data={data} />
        </TabsContent>
        <TabsContent value="monthly">
          <MonthlyTab data={data} />
        </TabsContent>
        <TabsContent value="employee">
          <EmployeeTab data={data} />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
