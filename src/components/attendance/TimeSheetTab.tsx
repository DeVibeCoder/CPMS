import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Lock,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/csv";
import {
  addDays,
  calculateEntry,
  formatDayMonthYear,
  formatDuration,
  sumEntries,
} from "@/lib/attendance/calculations";
import { awayOn, wasEmployedOn } from "@/lib/attendance/staff";
import {
  parseTimesheetCsv,
  timesheetCsv,
} from "@/lib/attendance/timesheetCsv";
import type { Timesheets } from "./useTimesheets";
import { StatTile, StatusBadge, departureTint } from "./shared";
import { TimeField } from "./TimeField";
import { BreaksField } from "./BreaksField";

/** What one import did, as the dialog afterwards reports it. */
interface TimingImportResult {
  applied: number;
  skipped: number;
  errors: string[];
  /** The dates the file actually changed, earliest first. */
  dates: string[];
}

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<TimingImportResult | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

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

  /**
   * Take the day away as a file.
   *
   * Template and export are one button because they are one file: it comes down
   * carrying the staff, the date and whatever has already been entered, so the
   * only thing left to do to it is type the times. A blank grid would mean
   * retyping the two columns that identify each row before reaching the one you
   * opened it for.
   */
  const onDownloadTemplate = () => {
    if (rows.length === 0) {
      toast({
        variant: "destructive",
        title: "There is nobody on this day's sheet yet.",
        description: "Add staff on the Employees tab first.",
      });
      return;
    }
    downloadText(
      `cpsm-timesheet-${date}.csv`,
      timesheetCsv(date, rows.map(({ employee, entry }) => ({ employee, entry }))),
    );
    toast({
      variant: "success",
      title: `Timesheet for ${formatDayMonthYear(date)} downloaded`,
      description:
        "Fill in Start, Breaks and End, then use Import. Anything left blank is left as it is.",
    });
  };

  /**
   * Read a filled file back in.
   *
   * Every readable row is taken even when others fail, and the failures are
   * listed in full — a clerk importing a whole plant's day needs the complete
   * list, not the first bad line. What a row is allowed to do is decided in
   * `lib/attendance/timesheetCsv.ts` against what is booked against each person;
   * this only hands over the file and shows what came back.
   */
  const onImport = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const { rows: parsed, errors } = parseTimesheetCsv(await file.text());
      const result =
        parsed.length > 0
          ? sheets.importTimings(parsed)
          : { changes: [], skipped: 0, errors: [], dates: [] };
      setImportResult({
        applied: result.changes.length,
        skipped: result.skipped,
        // The file's own unreadable lines first, then the rows the records
        // refused: one list, in the order the problems happened.
        errors: [...errors, ...result.errors],
        dates: result.dates,
      });
      // A file for one day that is not the day on screen: go there, because the
      // whole point of importing is then to read what went in.
      if (result.dates.length === 1 && result.dates[0] !== date) {
        onDateChange(result.dates[0]);
      }
    } catch (e) {
      setImportResult({
        applied: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : "The file could not be read."],
        dates: [],
      });
    } finally {
      setImporting(false);
      // Allow re-picking the same file after a correction.
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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

        {/* The file tools, grouped to the right so they read as an alternative
            to typing the sheet rather than part of choosing the day. Labels are
            dropped on a phone for the reason the Employees tab drops them: two
            buttons wide enough to read push the day picker onto a second row. */}
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
          {[
            {
              label: "Template",
              icon: FileDown,
              onClick: onDownloadTemplate,
              disabled: false,
            },
            {
              label: importing ? "Importing…" : "Import",
              icon: importing ? Loader2 : Upload,
              onClick: () => fileRef.current?.click(),
              disabled: importing,
            },
          ].map((tool) => (
            <Button
              key={tool.label}
              variant="outline"
              // Icon-only still has to say what it is, or it says nothing at
              // all to a screen reader and nothing on hover either.
              aria-label={tool.label}
              title={isMobile ? tool.label : undefined}
              size={isMobile ? "icon" : "sm"}
              disabled={tool.disabled}
              className={cn(isMobile && "h-9 w-9 shrink-0")}
              onClick={tool.onClick}
            >
              <tool.icon
                className={cn("h-4 w-4", tool.icon === Loader2 && "animate-spin")}
              />
              {!isMobile && tool.label}
            </Button>
          ))}
        </div>
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
          <Table className="min-w-[680px] text-[10px] [&_button]:h-7 [&_input]:h-7 [&_input]:px-1 [&_td]:px-1 [&_td]:py-1.5 [&_th]:h-9 [&_th]:px-1 [&_td:first-child]:pl-2 [&_th:first-child]:pl-2 [&_td:last-child]:pr-2 [&_th:last-child]:pr-2 sm:min-w-[1060px] sm:text-sm sm:[&_button]:h-8 sm:[&_input]:h-8 sm:[&_input]:px-2 sm:[&_td]:px-2 sm:[&_td]:py-3 sm:[&_th]:h-11 sm:[&_th]:px-2 sm:[&_td:first-child]:pl-4 sm:[&_th:first-child]:pl-4 sm:[&_td:last-child]:pr-4 sm:[&_th:last-child]:pr-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52px] sm:w-[86px]">Emp ID</TableHead>
                <TableHead className="min-w-[104px] sm:min-w-[170px]">Name</TableHead>
                <TableHead className="w-[54px] sm:w-[92px]">Start</TableHead>
                <TableHead className="w-[68px] sm:w-[120px]">Breaks</TableHead>
                <TableHead className="w-[54px] sm:w-[92px]">End</TableHead>
                <TableHead className="w-[62px] text-right sm:w-[96px]">Total Hrs</TableHead>
                <TableHead className="w-[56px] text-right sm:w-[88px]">OT Hrs</TableHead>
                <TableHead className="w-[78px] sm:w-[132px]">Status</TableHead>
                <TableHead className="min-w-[100px] sm:min-w-[160px]">Remarks</TableHead>
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
                    <TableCell className="font-mono text-[9px] sm:text-xs">
                      {employee.id}
                    </TableCell>
                    <TableCell>
                      {/* Both sized explicitly. The department was on a fixed
                          11px while the row around it dropped to 10 on a phone,
                          so the section ended up larger than the person — which
                          is backwards, and the reason this column reads oddly on
                          a small screen. */}
                      <div className="font-medium leading-tight">
                        {employee.name}
                      </div>
                      <div className="text-[8px] leading-tight text-muted-foreground sm:text-[11px]">
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
              Times are 24-hour — type 0700, or use Template and Import for the
              whole day at once. Status follows Employees → Status: book a
              vacation or a sick spell there and these rows fill in.
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

      <ImportReport
        result={importResult}
        onClose={() => setImportResult(null)}
      />
    </div>
  );
}

/**
 * What an import did, shown after every one of them.
 *
 * Successful or not: a file that half-loaded and said nothing is the failure
 * this exists to prevent. Three figures and, where there were any, the full list
 * of rows that were refused and why.
 *
 * It ends on the thing the plant asked to be certain of — importing fills the
 * rows in and stops. The day is still open, and completing it is still somebody
 * reading the sheet and pressing the button.
 */
function ImportReport({
  result,
  onClose,
}: {
  result: TimingImportResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(result)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import finished</DialogTitle>
          <DialogDescription>
            Rows are matched to a person and a date. A blank cell changes
            nothing, so a file covering one shift leaves the rest of the day as
            it was.
          </DialogDescription>
        </DialogHeader>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Applied", value: result.applied },
                { label: "Skipped", value: result.skipped },
                { label: "Failed", value: result.errors.length },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-muted/30 p-3 text-center"
                >
                  <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {result.applied > 0 && (
              <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                {result.dates.length === 1
                  ? `${formatDayMonthYear(result.dates[0])} is filled in and still open.`
                  : `${result.dates.length} days are filled in and still open.`}{" "}
                Check the rows, then use{" "}
                <span className="font-medium text-foreground">Complete day</span>{" "}
                — importing never completes a day on its own.
              </p>
            )}

            {result.skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                {result.skipped} row{result.skipped === 1 ? "" : "s"} asked for
                nothing: somebody booked away whose row agreed they were away, or
                a line left empty. Staff on vacation can be marked Vacation in the
                file or left out of it — both are read the same way.
              </p>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-destructive">
                  {result.errors.length} row
                  {result.errors.length === 1 ? "" : "s"} could not be imported
                </p>
                <div className="max-h-56 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 scrollbar-thin">
                  <ul className="space-y-1 text-xs text-destructive">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Nothing from those rows was written. Fix them and import the
                  file again — the rows that succeeded are simply written over
                  with the same values rather than duplicated.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
