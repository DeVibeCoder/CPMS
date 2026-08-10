import { useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  calculateWeek,
  formatDuration,
  weekDates,
} from "@/lib/attendance/calculations";
import type { DayResult, WeekResult } from "@/types/attendance";
import type { AttendanceData } from "./useAttendance";
import { DayDetailDialog } from "./DayDetailDialog";
import {
  Balance,
  DAY_STATUS_META,
  Hours,
  StatTile,
  StatusDot,
  WEEKDAY_LABELS,
} from "./shared";

/**
 * The main working view: every employee's week on one screen.
 *
 * A row per person, a column per day. The point is that an admin can scan down
 * the Balance column and see instantly who is short and who is over, then click
 * into the day that explains it.
 */
export function WeeklyTab({ data }: { data: AttendanceData }) {
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(data.weekStarts[0] ?? data.today);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [openDay, setOpenDay] = useState<{ day: DayResult; name: string } | null>(null);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  const weeks = useMemo(
    () =>
      data.employees.map((employee) => ({
        employee,
        week: calculateWeek(employee.id, weekStart, data.recordsFor(employee.id)),
      })),
    [data, weekStart],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return weeks.filter(({ employee, week }) => {
      if (department !== "all" && employee.department !== department) return false;
      if (q && !`${employee.name} ${employee.id}`.toLowerCase().includes(q)) {
        return false;
      }
      if (status === "short" && week.shortfallMinutes === 0) return false;
      if (status === "overtime" && week.overtimeMinutes === 0) return false;
      if (status === "compensated" && week.compensationMinutes === 0) return false;
      if (status === "missing" && week.daysMissing === 0) return false;
      if (status === "square" && week.balanceMinutes !== 0) return false;
      return true;
    });
  }, [weeks, query, department, status]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, { week }) => ({
          worked: t.worked + week.workedMinutes,
          normal: t.normal + week.normalMinutes,
          compensation: t.compensation + week.compensationMinutes,
          overtime: t.overtime + week.overtimeMinutes,
          shortfall: t.shortfall + week.shortfallMinutes,
          missing: t.missing + week.daysMissing,
        }),
        { worked: 0, normal: 0, compensation: 0, overtime: 0, shortfall: 0, missing: 0 },
      ),
    [rows],
  );

  const presentToday = useMemo(
    () =>
      data.employees.filter((e) =>
        data.recordsFor(e.id).some((r) => r.date === data.today && r.timeIn),
      ).length,
    [data],
  );

  const weekLabel = (start: string) =>
    `${format(parseISO(start), "dd MMM")} – ${format(parseISO(weekDates(start)[6]), "dd MMM yyyy")}`;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Staff" value={String(rows.length)} hint="in this view" />
        <StatTile
          label="Present today"
          value={`${presentToday} / ${data.employees.length}`}
          tone={presentToday === data.employees.length ? "success" : "default"}
        />
        <StatTile label="Hours this week" value={formatDuration(totals.worked)} />
        <StatTile label="Normal" value={formatDuration(totals.normal)} />
        <StatTile
          label="Compensation"
          value={formatDuration(totals.compensation)}
          tone="warning"
          hint="covered a short day"
        />
        <StatTile
          label="Overtime"
          value={formatDuration(totals.overtime)}
          tone="primary"
          hint={`shortfall ${formatDuration(totals.shortfall)}`}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={weekStart} onValueChange={setWeekStart}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.weekStarts.map((start, i) => (
              <SelectItem key={start} value={start}>
                {i === 0 ? "This week · " : ""}
                {weekLabel(start)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Name or staff number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {data.departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="square">Exactly 48h</SelectItem>
            <SelectItem value="overtime">Has overtime</SelectItem>
            <SelectItem value="short">Has shortfall</SelectItem>
            <SelectItem value="compensated">Has compensation</SelectItem>
            <SelectItem value="missing">Missing days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No employees match these filters.
          </CardContent>
        </Card>
      ) : isMobile ? (
        <MobileWeek rows={rows} onOpenDay={setOpenDay} />
      ) : (
        <DesktopWeek rows={rows} dates={dates} onOpenDay={setOpenDay} />
      )}

      <Legend />

      <DayDetailDialog
        open={openDay !== null}
        day={openDay?.day ?? null}
        employeeName={openDay?.name ?? ""}
        onOpenChange={(open) => !open && setOpenDay(null)}
      />
    </div>
  );
}

interface Row {
  employee: { id: string; name: string; department: string; position: string };
  week: WeekResult;
}

/** Desktop: one row per person, one column per day. */
function DesktopWeek({
  rows,
  dates,
  onOpenDay,
}: {
  rows: Row[];
  dates: string[];
  onOpenDay: (v: { day: DayResult; name: string }) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[190px]">Employee</TableHead>
                {dates.map((date, i) => (
                  <TableHead key={date} className="min-w-[92px] text-center">
                    <div>{WEEKDAY_LABELS[i]}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {format(parseISO(date), "dd MMM")}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">OT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ employee, week }) => (
                <TableRow key={employee.id}>
                  <TableCell className="align-top">
                    <div className="font-medium leading-tight">{employee.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {employee.id} · {employee.position}
                    </div>
                  </TableCell>

                  {week.days.map((day) => (
                    <TableCell
                      key={day.date}
                      className={cn(
                        "p-0 align-top",
                        DAY_STATUS_META[day.status].cell,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDay({ day, name: employee.name })}
                        className="flex h-full w-full flex-col items-center gap-0.5 px-1.5 py-2 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            DAY_STATUS_META[day.status].text,
                          )}
                        >
                          {day.workedMinutes === null
                            ? day.status === "missing"
                              ? "!"
                              : "—"
                            : formatDuration(day.workedMinutes)}
                        </span>
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {day.record?.timeIn ?? ""}
                          {day.record?.timeOut ? `–${day.record.timeOut}` : ""}
                        </span>
                      </button>
                    </TableCell>
                  ))}

                  <TableCell className="text-right align-top font-semibold">
                    <Hours minutes={week.workedMinutes} />
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Balance minutes={week.balanceMinutes} />
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {week.overtimeMinutes > 0 ? (
                      <span className="font-medium tabular-nums text-primary">
                        {formatDuration(week.overtimeMinutes)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mobile: a card per person with the week as a compact strip.
 *
 * The desktop grid is ten columns wide and there is no honest way to fit that
 * on a phone, so the same information is restacked rather than shrunk.
 */
function MobileWeek({
  rows,
  onOpenDay,
}: {
  rows: Row[];
  onOpenDay: (v: { day: DayResult; name: string }) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map(({ employee, week }) => (
        <Card key={employee.id}>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium leading-tight">{employee.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {employee.id} · {employee.department}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  {formatDuration(week.workedMinutes)}
                </div>
                <Balance minutes={week.balanceMinutes} className="text-[11px]" />
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {week.days.map((day, i) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onOpenDay({ day, name: employee.name })}
                  className={cn(
                    "rounded-md border border-border px-0.5 py-1 text-center",
                    DAY_STATUS_META[day.status].cell,
                  )}
                >
                  <div className="text-[10px] text-muted-foreground">
                    {WEEKDAY_LABELS[i]}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] font-semibold tabular-nums",
                      DAY_STATUS_META[day.status].text,
                    )}
                  >
                    {day.workedMinutes === null
                      ? day.status === "missing"
                        ? "!"
                        : "—"
                      : `${Math.floor(day.workedMinutes / 60)}h`}
                  </div>
                </button>
              ))}
            </div>

            {(week.overtimeMinutes > 0 || week.compensationMinutes > 0) && (
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                {week.compensationMinutes > 0 && (
                  <span>Compensation {formatDuration(week.compensationMinutes)}</span>
                )}
                {week.overtimeMinutes > 0 && (
                  <span className="text-primary">
                    Overtime {formatDuration(week.overtimeMinutes)}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Legend() {
  const shown: Array<keyof typeof DAY_STATUS_META> = [
    "normal",
    "extra",
    "short",
    "missing",
    "rest",
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {shown.map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <StatusDot status={key} />
          {DAY_STATUS_META[key].label}
        </span>
      ))}
      <span className="text-muted-foreground/70">
        Click a day for the full timesheet entry.
      </span>
    </div>
  );
}
