import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  calculateMonth,
  calculateWeek,
  formatDuration,
} from "@/lib/attendance/calculations";
import type { DayResult, WeekResult } from "@/types/attendance";
import type { AttendanceData } from "./useAttendance";
import { Balance, DAY_STATUS_META, Field, StatTile, StatusDot } from "./shared";

/**
 * One person, in full.
 *
 * This is the view used when somebody queries their hours: the current week day
 * by day, the month's totals, and the remark against any day that was cut
 * short — everything needed to answer "why is my total that number" without
 * opening a spreadsheet.
 */
export function EmployeeTab({ data }: { data: AttendanceData }) {
  const [employeeId, setEmployeeId] = useState(data.employees[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(data.weekStarts[0] ?? data.today);

  const employee = data.employees.find((e) => e.id === employeeId);
  const records = useMemo(
    () => (employee ? data.recordsFor(employee.id) : []),
    [data, employee],
  );

  const week = useMemo(
    () => (employee ? calculateWeek(employee.id, weekStart, records) : null),
    [employee, weekStart, records],
  );
  const month = useMemo(
    () =>
      employee
        ? calculateMonth(employee.id, `${weekStart.slice(0, 7)}-01`, records)
        : null,
    [employee, weekStart, records],
  );

  if (!employee || !week || !month) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No employees to show.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.id} · {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={weekStart} onValueChange={setWeekStart}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.weekStarts.map((start, i) => (
              <SelectItem key={start} value={start}>
                {i === 0 ? "This week · " : ""}
                {format(parseISO(start), "dd MMM yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Field label="Employee ID">{employee.id}</Field>
          <Field label="Name">{employee.name}</Field>
          <Field label="Section">{employee.department}</Field>
          <Field label="Position">{employee.position}</Field>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Week of {format(parseISO(week.weekStart), "dd MMM yyyy")}
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Worked" value={formatDuration(week.workedMinutes)} />
          <StatTile label="Target" value={formatDuration(week.targetMinutes)} />
          <StatTile label="Normal" value={formatDuration(week.normalMinutes)} />
          <StatTile
            label="Compensation"
            value={formatDuration(week.compensationMinutes)}
            tone="warning"
          />
          <StatTile
            label="Overtime"
            value={formatDuration(week.overtimeMinutes)}
            tone="primary"
          />
          <StatTile
            label="Shortfall"
            value={formatDuration(week.shortfallMinutes)}
            tone={week.shortfallMinutes > 0 ? "destructive" : "default"}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily record</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="min-w-[200px]">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {week.days.map((day) => (
                  <DayRow key={day.date} day={day} />
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={4}>Week total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(week.workedMinutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(week.targetMinutes)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Balance minutes={week.balanceMinutes} />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {format(parseISO(month.month), "MMMM yyyy")} — month to date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Total worked">{formatDuration(month.workedMinutes)}</Field>
            <Field label="Normal">{formatDuration(month.normalMinutes)}</Field>
            <Field label="Compensation">
              {formatDuration(month.compensationMinutes)}
            </Field>
            <Field label="Overtime">{formatDuration(month.overtimeMinutes)}</Field>
            <Field label="Shortfall">{formatDuration(month.shortfallMinutes)}</Field>
            <Field label="Days worked">{month.daysWorked}</Field>
            <Field label="Missing days">
              <span className={month.daysMissing > 0 ? "text-destructive" : undefined}>
                {month.daysMissing}
              </span>
            </Field>
            <Field label="Weeks counted">{month.weeks.length}</Field>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week starting</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Normal</TableHead>
                  <TableHead className="text-right">Compensation</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {month.weeks.map((w: WeekResult) => (
                  <TableRow key={w.weekStart}>
                    <TableCell>
                      {format(parseISO(w.weekStart), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(w.workedMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(w.normalMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(w.compensationMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-primary">
                      {formatDuration(w.overtimeMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatDuration(w.shortfallMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DayRow({ day }: { day: DayResult }) {
  const meta = DAY_STATUS_META[day.status];
  return (
    <TableRow className={cn(meta.cell)}>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusDot status={day.status} />
          <div>
            <div className="font-medium leading-tight">
              {format(parseISO(day.date), "EEE dd MMM")}
            </div>
            {day.overnight && (
              <Badge variant="secondary" className="mt-0.5">
                Night
              </Badge>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="tabular-nums">{day.record?.timeIn ?? "—"}</TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {day.record?.breakStart && day.record?.breakEnd
          ? `${day.record.breakStart}–${day.record.breakEnd}`
          : "—"}
      </TableCell>
      <TableCell className="tabular-nums">{day.record?.timeOut ?? "—"}</TableCell>
      <TableCell className={cn("text-right font-medium tabular-nums", meta.text)}>
        {formatDuration(day.workedMinutes)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {day.targetMinutes > 0 ? formatDuration(day.targetMinutes) : "—"}
      </TableCell>
      <TableCell className="text-right">
        {day.differenceMinutes === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Balance minutes={day.differenceMinutes} />
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {day.record?.remarks ?? (day.status === "missing" ? "No clock-out recorded" : "")}
      </TableCell>
    </TableRow>
  );
}
