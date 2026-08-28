import { useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addDays,
  calculateEntry,
  formatDuration,
  sumEntries,
} from "@/lib/attendance/calculations";
import { awayOn, wasEmployedOn } from "@/lib/attendance/staff";
import type { Timesheets } from "./useTimesheets";
import { StatTile, StatusBadge, departureTint } from "./shared";
import { TimeField } from "./TimeField";
import { BreaksField } from "./BreaksField";

/**
 * The daily timesheet — one day, every employee, filled in and signed off.
 *
 * A completed day is locked rather than hidden: somebody checking a figure in
 * the master sheet needs to be able to come back and see what was entered. It
 * can be reopened, which on a real system would be the point where an approval
 * trail starts.
 *
 * The status column is read-only, and deliberately so: it shows what the
 * Employees → Status tab says and has no way to disagree with it. A supervisor
 * who has recorded somebody's vacation should not have to say it again every
 * morning of it — and a screen where they could say something different would
 * drift out of step with the staff list the first time the two were typed
 * differently. What is filled in here is hours; who was away is settled
 * elsewhere.
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
  const submitted = sheets.isSubmitted(date);

  // The whole roster, not just current staff: somebody who has since left still
  // belongs on the sheets for the days they worked, and dropping them would make
  // a completed week stop adding up.
  const rows = useMemo(
    () =>
      sheets.roster
        .filter((employee) => wasEmployedOn(sheets.departures, employee.id, date))
        .map((employee) => {
          const entry = sheets.entryFor(employee.id, date);
          return {
            employee,
            entry,
            totals: calculateEntry(entry),
            away: awayOn(sheets.departures, employee.id, date),
          };
        }),
    [sheets, date],
  );

  const set = (employeeId: string, patch: Parameters<Timesheets["updateEntry"]>[2]) =>
    sheets.updateEntry(employeeId, date, patch);

  /**
   * Bring the day's rows into line with what is booked against each person.
   *
   * The rule and the writing both live in the hook, so a departure added on the
   * Status tab reaches the stored rows whether or not this screen is open — the
   * master sheet and every total read those rows, and a day that only *looked*
   * like a vacation here would count as a worked day everywhere else. What is
   * left for this component is the one case the hook cannot reach on its own: a
   * date nobody has opened yet has no rows to correct, so opening it is when
   * they get written.
   */
  const { syncDay } = sheets;
  useEffect(() => {
    syncDay(date);
  }, [syncDay, date]);

  const dayTotals = useMemo(() => sumEntries(rows.map((r) => r.entry)), [rows]);

  const complete = () => {
    const unfinished = rows.filter(
      (r) => r.entry?.status === "present" && r.totals.workedMinutes === null,
    );
    if (unfinished.length > 0) {
      toast({
        variant: "destructive",
        title: "Some rows have no start or end time",
        description: `${unfinished.map((r) => r.employee.name).join(", ")} — enter the times, or record the absence on Employees → Status and the row will fill itself in.`,
      });
      return;
    }
    sheets.submitDate(date);
    toast({
      variant: "success",
      title: "Timesheet completed",
      description: `${format(parseISO(date), "EEEE dd MMM")} now appears in the master sheet.`,
    });
  };

  return (
    <div className="space-y-3">
      {/* Day picker. The day name and the open/completed state are what a clerk
          is checking; the full date is already in the field beside it. */}
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
        <span className="text-sm font-semibold">
          {format(parseISO(date), "EEEE")}
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

      {/* One table, on every screen. The cards this replaced showed one person
          at a time, and a timesheet is read across people — whose hours are
          missing, who is still out — which a column answers at a glance and a
          stack of cards does not. It scrolls sideways on a phone, which is the
          honest cost of nine columns. */}
      <Card>
        <CardContent className="p-0">
          {/*
            Nine columns of a plant's working day do not fit a laptop, so the
            table is given the width it actually needs and the card scrolls
            sideways. Left to divide up whatever was going, the browser took it
            out of the narrowest columns — and those are Start, Breaks and End,
            which then clipped the very times the sheet exists to record.

            The cell padding is halved here for the same reason: at the shared
            px-4 the padding alone was 288px of the row, more than three time
            columns' worth.
          */}
          <Table className="min-w-[1060px] [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[64px] sm:w-[86px]">Emp ID</TableHead>
                <TableHead className="min-w-[128px] sm:min-w-[170px]">Name</TableHead>
                <TableHead className="w-[74px] sm:w-[92px]">Start</TableHead>
                <TableHead className="w-[96px] sm:w-[120px]">Breaks</TableHead>
                <TableHead className="w-[74px] sm:w-[92px]">End</TableHead>
                <TableHead className="w-[76px] text-right sm:w-[96px]">Total Hrs</TableHead>
                <TableHead className="w-[70px] text-right sm:w-[88px]">OT Hrs</TableHead>
                <TableHead className="w-[104px] sm:w-[132px]">Status</TableHead>
                <TableHead className="min-w-[130px] sm:min-w-[160px]">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ employee, entry, totals, away }) => {
                // A booked absence owns the row: the times are meaningless
                // and the status is not a choice while it runs.
                // A booked absence owns the row as completely as a sign-off
                // does: there are no hours to record on a day somebody was
                // not here, and the status is not this screen's to argue with.
                const locked = submitted || Boolean(away);

                return (
                  <TableRow
                    key={employee.id}
                    className={cn(away && departureTint(away.type))}
                  >
                    <TableCell className="font-mono text-[10px] sm:text-xs">
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
                        aria-label={`Start for ${employee.name}`}
                        value={entry?.start}
                        disabled={locked}
                        onChange={(v) => set(employee.id, { start: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <BreaksField
                        entry={entry}
                        disabled={locked}
                        onChange={(breaks) => set(employee.id, { breaks })}
                      />
                    </TableCell>
                    <TableCell>
                      <TimeField
                        aria-label={`End for ${employee.name}`}
                        value={entry?.end}
                        disabled={locked}
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
                      <StatusBadge status={entry?.status ?? "present"} />
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
        </CardContent>
      </Card>

      {/* Sign-off */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0 flex-1 text-sm">
          {submitted ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Completed and locked. It appears in the master sheet.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Times are 24-hour — type 0700. Status follows Employees → Status:
              book a vacation or a sick spell there and these rows fill in.
            </span>
          )}
        </div>
        {/* Full width on a phone: this is the one button on the screen that
            finishes the day, and it should not end up a thumbnail wedged
            against the edge after the sentence beside it wraps. */}
        {submitted ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => sheets.reopenDate(date)}
          >
            Reopen
          </Button>
        ) : (
          <Button className="w-full sm:w-auto" onClick={complete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Complete day
          </Button>
        )}
      </div>
    </div>
  );
}
