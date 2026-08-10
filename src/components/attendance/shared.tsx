import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDuration, formatSigned } from "@/lib/attendance/calculations";
import type { DayStatus } from "@/types/attendance";

/**
 * Shared bits of the Attendance UI.
 *
 * Attendance is an admin productivity screen: somebody scanning fourteen people
 * across seven days wants density and a consistent visual language, not large
 * decorated cards. Everything here is built for that.
 */

/** One figure in the summary strip. Compact by design — there are seven of them. */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];

  return (
    <Card className="shadow-none">
      <CardContent className="px-3 py-2.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", toneClass)}>
          {value}
        </div>
        {hint && (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** How each day status is described and coloured, in one place. */
export const DAY_STATUS_META: Record<
  DayStatus,
  { label: string; dot: string; text: string; cell: string }
> = {
  normal: {
    label: "Full day",
    dot: "bg-success",
    text: "text-foreground",
    cell: "",
  },
  extra: {
    label: "Over target",
    dot: "bg-primary",
    text: "text-primary",
    cell: "bg-primary/[0.06]",
  },
  short: {
    label: "Under target",
    dot: "bg-warning",
    text: "text-warning",
    cell: "bg-warning/[0.08]",
  },
  missing: {
    label: "No clock-out",
    dot: "bg-destructive",
    text: "text-destructive",
    cell: "bg-destructive/[0.07]",
  },
  rest: {
    label: "Absent",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    cell: "",
  },
  off: {
    label: "Not a working day",
    dot: "bg-muted-foreground/25",
    text: "text-muted-foreground",
    cell: "",
  },
};

export function StatusDot({ status }: { status: DayStatus }) {
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", DAY_STATUS_META[status].dot)}
      aria-hidden
    />
  );
}

/** A duration that colours itself by sign. Used wherever a balance is shown. */
export function Balance({
  minutes,
  className,
}: {
  minutes: number | null;
  className?: string;
}) {
  if (minutes === null) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        minutes > 0 && "text-primary",
        minutes < 0 && "text-warning",
        minutes === 0 && "text-muted-foreground",
        className,
      )}
    >
      {formatSigned(minutes)}
    </span>
  );
}

export function Hours({
  minutes,
  className,
}: {
  minutes: number | null;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatDuration(minutes)}</span>
  );
}

/** The banner that keeps reviewers from mistaking this for live plant data. */
export function MockDataNotice() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs">
      <Badge variant="warning">Under development</Badge>
      <span className="text-muted-foreground">
        Sample data only — invented employees and shifts. Attendance is not
        connected to any staff, payroll or HR system.
      </span>
    </div>
  );
}

/** A labelled field for the detail views. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
