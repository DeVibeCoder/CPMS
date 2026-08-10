import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  addDays,
  calculateEntry,
  formatDuration,
  sumEntries,
} from "@/lib/attendance/calculations";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/types/attendance";
import type { Timesheets } from "./useTimesheets";
import { StatTile, StatusBadge } from "./shared";

/**
 * The daily timesheet — one day, every employee, filled in and signed off.
 *
 * A completed day is locked rather than hidden: somebody checking a figure in
 * the master sheet needs to be able to come back and see what was entered. It
 * can be reopened, which on a real system would be the point where an approval
 * trail starts.
 */
export function TimeSheetTab({
  sheets,
  date,
  onDateChange,
}: {
  sheets: Timesheets;
  date: string;
  onDateChange: (date: string) => void;
}) {
  const isMobile = useIsMobile();
  const submitted = sheets.isSubmitted(date);

  const rows = useMemo(
    () =>
      sheets.employees.map((employee) => {
        const entry = sheets.entryFor(employee.id, date);
        return { employee, entry, totals: calculateEntry(entry) };
      }),
    [sheets, date],
  );

  const dayTotals = useMemo(
    () => sumEntries(rows.map((r) => r.entry)),
    [rows],
  );

  const set = (employeeId: string, patch: Parameters<Timesheets["updateEntry"]>[2]) =>
    sheets.updateEntry(employeeId, date, patch);

  const complete = () => {
    const unfinished = rows.filter(
      (r) => r.entry?.status === "present" && r.totals.workedMinutes === null,
    );
    if (unfinished.length > 0) {
      toast({
        variant: "destructive",
        title: "Some rows have no start or end time",
        description: `${unfinished.map((r) => r.employee.name).join(", ")} — enter the times, or set the status to Sick or Vacation.`,
      });
      return;
    }
    sheets.submitDate(date);
    toast({
      variant: "success",
      title: "Timesheet completed",
      description: `${format(parseISO(date), "EEEE, dd MMM yyyy")} now appears in the master sheet.`,
    });
  };

  return (
    <div className="space-y-3">
      {/* Day picker */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Previous day"
          onClick={() => onDateChange(addDays(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          className="h-9 w-[170px]"
          value={date}
          max={sheets.today}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label="Next day"
          disabled={date >= sheets.today}
          onClick={() => onDateChange(addDays(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(parseISO(date), "EEEE, dd MMMM yyyy")}
        </span>
        {submitted ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </Badge>
        ) : (
          <Badge variant="secondary">Open</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Staff" value={String(rows.length)} />
        <StatTile label="Present" value={String(dayTotals.daysPresent)} tone="success" />
        <StatTile label="Total hours" value={formatDuration(dayTotals.workedMinutes)} />
        <StatTile
          label="OT hours"
          value={formatDuration(dayTotals.overtimeMinutes)}
          tone="primary"
        />
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {rows.map(({ employee, entry, totals }) => (
            <Card key={employee.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{employee.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {employee.id}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">
                      {formatDuration(totals.workedMinutes)}
                    </div>
                    {totals.overtimeMinutes > 0 && (
                      <div className="text-[11px] text-primary">
                        OT {formatDuration(totals.overtimeMinutes)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <TimeField
                    label="Start"
                    value={entry?.start}
                    disabled={submitted || entry?.status !== "present"}
                    onChange={(v) => set(employee.id, { start: v })}
                  />
                  <BreakField
                    value={entry?.breakMinutes}
                    disabled={submitted || entry?.status !== "present"}
                    onChange={(v) => set(employee.id, { breakMinutes: v })}
                  />
                  <TimeField
                    label="End"
                    value={entry?.end}
                    disabled={submitted || entry?.status !== "present"}
                    onChange={(v) => set(employee.id, { end: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatusSelect
                    value={entry?.status ?? "present"}
                    disabled={submitted}
                    onChange={(v) => set(employee.id, { status: v })}
                  />
                  <Input
                    className="h-9"
                    placeholder="Remarks"
                    disabled={submitted}
                    value={entry?.remarks ?? ""}
                    onChange={(e) => set(employee.id, { remarks: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Emp ID</TableHead>
                    <TableHead className="min-w-[170px]">Name</TableHead>
                    <TableHead className="w-[110px]">Start</TableHead>
                    <TableHead className="w-[100px]">Break</TableHead>
                    <TableHead className="w-[110px]">End</TableHead>
                    <TableHead className="w-[100px] text-right">Total Hrs</TableHead>
                    <TableHead className="w-[95px] text-right">OT Hrs</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="min-w-[180px]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ employee, entry, totals }) => {
                    const away = (entry?.status ?? "present") !== "present";
                    return (
                      <TableRow key={employee.id} className={cn(away && "bg-muted/40")}>
                        <TableCell className="font-mono text-xs">
                          {employee.id}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium leading-tight">
                            {employee.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {employee.department}
                          </div>
                        </TableCell>
                        <TableCell>
                          <TimeField
                            value={entry?.start}
                            disabled={submitted || away}
                            onChange={(v) => set(employee.id, { start: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <BreakField
                            value={entry?.breakMinutes}
                            disabled={submitted || away}
                            onChange={(v) => set(employee.id, { breakMinutes: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <TimeField
                            value={entry?.end}
                            disabled={submitted || away}
                            onChange={(v) => set(employee.id, { end: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatDuration(totals.workedMinutes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {totals.overtimeMinutes > 0 ? (
                            <span className="text-primary">
                              {formatDuration(totals.overtimeMinutes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {submitted ? (
                            <StatusBadge status={entry?.status ?? "present"} />
                          ) : (
                            <StatusSelect
                              value={entry?.status ?? "present"}
                              onChange={(v) => set(employee.id, { status: v })}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            placeholder="—"
                            disabled={submitted}
                            value={entry?.remarks ?? ""}
                            onChange={(e) =>
                              set(employee.id, { remarks: e.target.value })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign-off */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="text-sm">
          {submitted ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Completed and locked. It appears in the master sheet.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Check the times, then complete the day to send it to the master
              sheet.
            </span>
          )}
        </div>
        {submitted ? (
          <Button variant="outline" onClick={() => sheets.reopenDate(date)}>
            Reopen
          </Button>
        ) : (
          <Button onClick={complete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Complete day
          </Button>
        )}
      </div>
    </div>
  );
}

function TimeField({
  value,
  onChange,
  disabled,
  label,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <div className="mb-0.5 text-[10px] uppercase text-muted-foreground">
          {label}
        </div>
      )}
      <Input
        type="time"
        className="h-8 px-2"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

/** The break is a duration, not a clock time — minutes off the shift. */
function BreakField({
  value,
  onChange,
  disabled,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        step={15}
        className="h-8 pr-9"
        placeholder="0"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
        min
      </span>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: AttendanceStatus;
  onChange: (value: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as AttendanceStatus)}
    >
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ATTENDANCE_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
