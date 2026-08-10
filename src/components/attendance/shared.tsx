import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/types/attendance";

/** Keeps a reviewer from mistaking the sample for live plant data. */
export function MockDataNotice() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs">
      <Badge variant="warning">Under development</Badge>
      <span className="text-muted-foreground">
        Sample data only — invented employees and shifts. Attendance is not
        connected to any staff, payroll or HR system, and edits are lost on
        reload.
      </span>
    </div>
  );
}

/** One figure in a summary strip. Compact — several sit side by side. */
export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warning" | "success";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
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
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === "sick") return <Badge variant="destructive">Sick</Badge>;
  if (status === "vacation") return <Badge variant="warning">Vacation</Badge>;
  return <Badge variant="success">Present</Badge>;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
