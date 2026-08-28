import { Fragment, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  calculateEntry,
  formatDuration,
  formatShort,
  monthDates,
  sumEntries,
  weekdayOf,
  weekDates,
} from "@/lib/attendance/calculations";
import { isCurrentStaff } from "@/lib/attendance/staff";
import type { Timesheets } from "./useTimesheets";
import { StatTile, WEEKDAY_LABELS } from "./shared";

/**
 * The master sheet: completed days only, names down the side and dates across
 * the top, each date carrying its total and overtime hours.
 *
 * Only days that have been completed on the timesheet appear here. A day still
 * being filled in has no business in a sheet people read figures off, and the
 * distinction is what makes "complete" mean something.
 */
export function MasterTab({ sheets }: { sheets: Timesheets }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(sheets.weekStarts[0] ?? sheets.today);
  const [month, setMonth] = useState(sheets.months[0] ?? `${sheets.today.slice(0, 7)}-01`);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");

  // Sunday is not a working day at the plant, so an empty column for it only
  // makes the sheet harder to read.
  const dates = useMemo(() => {
    const all = period === "week" ? weekDates(weekStart) : monthDates(month);
    return all.filter((d) => weekdayOf(d) !== 0 && sheets.isSubmitted(d));
  }, [period, weekStart, month, sheets]);

  // The whole roster, so a period somebody worked and then left still adds up.
  // Which of them belong in *this* period is settled in `rows` below.
  const employees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sheets.roster.filter((e) => {
      if (department !== "all" && e.department !== department) return false;
      return !q || `${e.id} ${e.name}`.toLowerCase().includes(q);
    });
  }, [sheets.roster, query, department]);

  const rows = useMemo(
    () =>
      employees
        .map((employee) => {
          const cells = dates.map((date) => {
            const entry = sheets.entryFor(employee.id, date);
            return { date, entry, totals: calculateEntry(entry) };
          });
          return {
            employee,
            cells,
            totals: sumEntries(cells.map((c) => c.entry)),
          };
        })
        // Current staff always appear, so a week nobody filled in reads as zero
        // hours rather than as nobody being employed. Somebody who has left
        // appears only in the periods they actually worked — keeping them in
        // every later month would fill the sheet with blank rows.
        .filter(
          ({ employee, cells }) =>
            isCurrentStaff(sheets.departures, employee.id, sheets.today) ||
            cells.some((c) => c.entry),
        ),
    [employees, dates, sheets],
  );

  const grand = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          worked: t.worked + r.totals.workedMinutes,
          overtime: t.overtime + r.totals.overtimeMinutes,
        }),
        { worked: 0, overtime: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Staff" value={String(rows.length)} />
        <StatTile label="Days completed" value={String(dates.length)} />
        <StatTile label="Total hours" value={formatDuration(grand.worked)} />
        <StatTile label="OT hours" value={formatDuration(grand.overtime)} tone="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month")}>
          <SelectTrigger className="h-9 w-[104px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>

        {period === "week" ? (
          <Select value={weekStart} onValueChange={setWeekStart}>
            <SelectTrigger className="h-9 w-[190px] sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.weekStarts.map((start, i) => (
                <SelectItem key={start} value={start}>
                  {i === 0 ? "This week · " : ""}
                  {format(parseISO(start), "dd MMM")} –{" "}
                  {format(parseISO(weekDates(start)[6]), "dd MMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-[150px] sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.months.map((m) => (
                <SelectItem key={m} value={m}>
                  {format(parseISO(m), "MMMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative min-w-[150px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Employee ID or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-9 w-[150px] sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sheets.departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {dates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No completed days in this period. Fill in a day on the Time Sheet tab
            and complete it, and it will appear here.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 min-w-[130px] bg-card px-2 py-2 text-left text-xs font-medium text-muted-foreground sm:min-w-[190px] sm:px-3">
                      Employee
                    </th>
                    {dates.map((date) => (
                      <th
                        key={date}
                        colSpan={2}
                        className="border-l border-border px-2 py-1 text-center"
                      >
                        <div className="text-xs font-semibold">
                          {format(parseISO(date), "dd MMM")}
                        </div>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {WEEKDAY_LABELS[weekdayOf(date)]}
                        </div>
                      </th>
                    ))}
                    <th
                      colSpan={2}
                      className="border-l-2 border-border px-2 py-1 text-center text-xs font-semibold"
                    >
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-card px-2 pb-1.5 text-left font-normal sm:px-3">
                      {dates.length} day{dates.length === 1 ? "" : "s"}
                    </th>
                    {dates.map((date) => (
                      <SubHeads key={date} />
                    ))}
                    <SubHeads bold />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ employee, cells, totals }) => (
                    <tr key={employee.id} className="border-b border-border">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                        <div className="font-medium leading-tight">{employee.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {employee.id}
                        </div>
                      </td>
                      {cells.map(({ date, entry, totals: cell }) => {
                        const away = entry && entry.status !== "present";
                        return (
                          <Fragment key={date}>
                            <td
                              className={cn(
                                "border-l border-border px-2 py-1.5 text-center tabular-nums",
                                away && "text-muted-foreground",
                              )}
                              title={entry?.remarks}
                            >
                              {away
                                ? entry?.status === "sick"
                                  ? "Sick"
                                  : "Leave"
                                : formatShort(cell.workedMinutes)}
                            </td>
                            <td className="px-2 py-1.5 text-center tabular-nums text-primary">
                              {cell.overtimeMinutes > 0
                                ? formatShort(cell.overtimeMinutes)
                                : "—"}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="border-l-2 border-border px-2 py-1.5 text-center font-semibold tabular-nums">
                        {formatShort(totals.workedMinutes)}
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-primary">
                        {formatShort(totals.overtimeMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        Hours are shown as h:mm. Only days completed on the Time Sheet tab appear
        here.
      </p>
    </div>
  );
}

function SubHeads({ bold }: { bold?: boolean }) {
  return (
    <>
      <th
        className={cn(
          "border-l border-border px-2 pb-1.5 text-center font-normal",
          bold && "border-l-2",
        )}
      >
        Hrs
      </th>
      <th className="px-2 pb-1.5 text-center font-normal">OT</th>
    </>
  );
}
