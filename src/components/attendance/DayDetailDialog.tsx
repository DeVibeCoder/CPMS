import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatSigned } from "@/lib/attendance/calculations";
import type { DayResult } from "@/types/attendance";
import { DAY_STATUS_META, Field } from "./shared";

/**
 * One day's timesheet entry, opened from the weekly grid.
 *
 * It shows the arithmetic as well as the answer — clock times, the break that
 * was deducted, and the resulting figure — because the first question anybody
 * asks about an attendance total is how it was reached.
 */
export function DayDetailDialog({
  open,
  day,
  employeeName,
  onOpenChange,
}: {
  open: boolean;
  day: DayResult | null;
  employeeName: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {day && (
          <>
            <DialogHeader>
              <DialogTitle>{employeeName}</DialogTitle>
              <DialogDescription>
                {format(parseISO(day.date), "EEEE, dd MMMM yyyy")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    day.status === "extra"
                      ? "default"
                      : day.status === "short"
                        ? "warning"
                        : day.status === "missing"
                          ? "destructive"
                          : day.status === "normal"
                            ? "success"
                            : "secondary"
                  }
                >
                  {DAY_STATUS_META[day.status].label}
                </Badge>
                {day.overnight && <Badge variant="secondary">Night shift</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Time in">{day.record?.timeIn ?? "—"}</Field>
                <Field label="Time out">{day.record?.timeOut ?? "—"}</Field>
                <Field label="Break start">{day.record?.breakStart ?? "—"}</Field>
                <Field label="Break end">{day.record?.breakEnd ?? "—"}</Field>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                <Line label="Break deducted" value={formatDuration(day.breakMinutes)} />
                <Line
                  label="Worked"
                  value={formatDuration(day.workedMinutes)}
                  strong
                />
                <Line label="Daily target" value={formatDuration(day.targetMinutes)} />
                <Line
                  label="Difference"
                  value={
                    day.differenceMinutes === null
                      ? "—"
                      : formatSigned(day.differenceMinutes)
                  }
                  strong
                />
              </div>

              {day.record?.remarks && (
                <Field label="Remarks">
                  <span className="font-normal">{day.record.remarks}</span>
                </Field>
              )}

              {day.workedMinutes === null && (
                <p className="text-xs text-muted-foreground">
                  This day has no usable clock-in and clock-out pair, so no hours
                  are counted for it. It is reported as missing rather than as a
                  zero-hour day — the two mean different things.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Whether the difference above becomes overtime is decided across
                the whole week, not on this day. See the Rules tab.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
