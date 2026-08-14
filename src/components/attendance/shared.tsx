import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEPARTURE_LABELS,
  PRESENCE_LABELS,
  type AttendanceStatus,
  type DepartureType,
  type PresenceStatus,
} from "@/types/attendance";

/**
 * Keeps a reviewer from mistaking the sample for live plant data.
 *
 * It says where the data is kept as well as what it is: now that the module
 * saves to the browser, "sample data" on its own would leave somebody assuming
 * their imported staff list is backed up somewhere. It is not.
 */
export function MockDataNotice({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs">
      <Badge variant="warning">Under development</Badge>
      <span className="text-muted-foreground">
        The timesheets start from invented sample shifts. Attendance is not
        connected to any payroll or HR system — what you enter is saved in this
        browser only, and clearing site data loses it.
      </span>
      {onReset && (
        <button
          type="button"
          className="ml-auto font-medium text-warning underline-offset-2 hover:underline"
          onClick={onReset}
        >
          Reset to sample
        </button>
      )}
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
  if (status === "sick") return <Badge variant="success">Sick</Badge>;
  if (status === "vacation") return <Badge variant="info">Vacation</Badge>;
  if (status === "off-site") return <Badge variant="warning">Off site</Badge>;
  return <Badge variant="secondary">Present</Badge>;
}

/**
 * One colour per state, for every place a state is shown.
 *
 * Badges and row tints read from the same map so they cannot drift apart: a
 * vacation row and a vacation badge are the same blue because there is one
 * place that decides it.
 *
 * The four away-states each get their own colour precisely so none of them can
 * be mistaken for another — sick and an exit sharing red was the reason this
 * exists. On site is the odd one out and is deliberately neutral: it is the
 * ordinary case, most of the list is in it, and colouring the whole table would
 * leave the colours meaning nothing.
 */
type Tone = "blue" | "green" | "orange" | "red" | "neutral";

const BADGE_VARIANT: Record<Tone, ComponentProps<typeof Badge>["variant"]> = {
  // `info`, not `default`: the app's primary is a deep navy used for buttons and
  // tabs, so a vacation badge in it read as page furniture rather than as a
  // status. `info` is a brighter, clearly separate blue.
  blue: "info",
  green: "success",
  orange: "warning",
  red: "destructive",
  neutral: "secondary",
};

/** The row wash behind a highlighted person. Faint — it must stay readable. */
const ROW_TINT: Record<Tone, string> = {
  blue: "bg-info/[0.10] hover:bg-info/[0.14]",
  green: "bg-success/[0.08] hover:bg-success/[0.12]",
  orange: "bg-warning/[0.09] hover:bg-warning/[0.13]",
  red: "bg-destructive/[0.07] hover:bg-destructive/[0.10]",
  neutral: "",
};

export const DEPARTURE_TONE: Record<DepartureType, Tone> = {
  vacation: "blue",
  sick: "green",
  "off-site": "orange",
  exit: "red",
};

const PRESENCE_TONE: Record<PresenceStatus, Tone> = {
  "on-site": "neutral",
  "off-site": "orange",
  sick: "green",
  vacation: "blue",
};

/** The wash for a row highlighted because of a departure of this type. */
export const departureTint = (type: DepartureType) =>
  ROW_TINT[DEPARTURE_TONE[type]];

/** Where somebody is right now, for the staff list. */
export function PresenceBadge({ status }: { status: PresenceStatus }) {
  return (
    <Badge variant={BADGE_VARIANT[PRESENCE_TONE[status]]}>
      {PRESENCE_LABELS[status]}
    </Badge>
  );
}

/** What kind of departure a row is. Same colours as the status it produces. */
export function DepartureBadge({ type }: { type: DepartureType }) {
  return (
    <Badge variant={BADGE_VARIANT[DEPARTURE_TONE[type]]}>
      {DEPARTURE_LABELS[type]}
    </Badge>
  );
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
