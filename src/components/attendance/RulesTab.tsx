import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_POLICY,
  calculateWeek,
  formatDuration,
  formatSigned,
  weekDates,
} from "@/lib/attendance/calculations";
import type { AttendanceRecord } from "@/types/attendance";
import { WEEKDAY_LABELS } from "./shared";

/**
 * The rules, written out for the people who will be checking the numbers.
 *
 * The worked examples are not illustrations typed into the page — they are run
 * through the same engine the rest of the module uses, so this tab cannot drift
 * away from the behaviour it describes. Change the policy and these figures
 * change with it.
 */

const MONDAY = "2026-08-03";

/** Build a week from a list of hours per day, Monday first. */
function exampleWeek(hours: number[]): AttendanceRecord[] {
  const dates = weekDates(MONDAY);
  return hours.flatMap((h, i) => {
    if (h <= 0) return [];
    const takesBreak = h > 5;
    const end = 7 + h + (takesBreak ? 1 : 0);
    const record: AttendanceRecord = {
      employeeId: "EXAMPLE",
      date: dates[i],
      timeIn: "07:00",
      timeOut: `${String(end).padStart(2, "0")}:00`,
    };
    if (takesBreak) {
      record.breakStart = "12:00";
      record.breakEnd = "13:00";
    }
    return [record];
  });
}

const EXAMPLES: { title: string; hours: number[]; note: string }[] = [
  {
    title: "A straight week",
    hours: [8, 8, 8, 8, 8, 8],
    note: "Eight hours a day, six days. Nothing owed either way.",
  },
  {
    title: "Released early, made up later",
    hours: [6, 10, 8, 8, 8, 8],
    note:
      "Monday was cut short by weather and Tuesday ran long. The two hours cancel out, so the week is square and none of Tuesday's extra counts as overtime.",
  },
  {
    title: "Genuine overtime",
    hours: [10, 10, 8, 8, 8, 8],
    note:
      "Nothing to make up, so all four hours beyond the weekly requirement are overtime.",
  },
  {
    title: "Both at once",
    hours: [6, 12, 10, 8, 8, 8],
    note:
      "Two of the extra hours cover Monday's short day; the remaining four are overtime. The same hour is never counted as both.",
  },
  {
    title: "Short week",
    hours: [8, 8, 6, 8, 8, 6],
    note: "Nothing above target to draw on, so the four hours stay as a shortfall.",
  },
];

export function RulesTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Weekly target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {DEFAULT_POLICY.weeklyTargetMinutes / 60} hours
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Monday to Saturday. The week a Sunday belongs to is the one that
              began six days earlier.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daily target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {DEFAULT_POLICY.dailyTargetMinutes / 60} hours
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Six working days at eight hours is exactly the weekly target, which
              is what lets the daily and weekly figures reconcile.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Break</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">Excluded</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Never counted as worked time. A break recorded outside the clocked
              hours is ignored rather than deducted.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How a day is measured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[13px]">
            worked = (time out − time in) − break
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Worked in="07:00" out="17:00" brk="12:00–13:00" result="9h 00m" />
            <Worked in="07:00" out="15:00" brk="12:00–13:00" result="7h 00m" />
            <Worked in="07:00" out="18:00" brk="12:00–13:00" result="10h 00m" />
          </div>
          <p className="text-xs text-muted-foreground">
            A shift whose clock-out is earlier than its clock-in ran through
            midnight and is measured accordingly. A day missing either a
            clock-in or a clock-out counts as no hours at all and is flagged as
            missing — it is never treated as a zero-hour day, because the two
            mean different things.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How the week is settled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            A day over eight hours is <strong>not</strong> automatically
            overtime. The plant releases people early for weather and plant
            conditions and expects those hours back later in the same week, so
            the week is settled as a whole.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Rule
              label="Compensation"
              body="Hours above target on one day that cancel a shortfall on another day of the same week."
            />
            <Rule
              label="Overtime"
              body="What is left of those extra hours once the 48 hours are met."
            />
            <Rule
              label="Shortfall"
              body="How far under 48 hours the week finished, after any extra hours have been applied."
            />
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">
            compensation = min(total extra, total short)
            <br />
            overtime = total extra − compensation
            <br />
            shortfall = total short − compensation
          </div>
          <p className="text-xs text-muted-foreground">
            Written this way, no hour can land in two columns: the extra hours
            split into compensation and overtime and nothing else, and the short
            hours split into compensation and shortfall and nothing else.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Worked examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {EXAMPLES.map((example) => {
            const week = calculateWeek("EXAMPLE", MONDAY, exampleWeek(example.hours));
            return (
              <div key={example.title} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">{example.title}</span>
                  <span className="text-xs text-muted-foreground">{example.note}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {example.hours.map((h, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-border px-2 py-1 text-[11px] tabular-nums"
                    >
                      <span className="text-muted-foreground">
                        {WEEKDAY_LABELS[i]}{" "}
                      </span>
                      {h}h
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <Figure label="Worked" value={formatDuration(week.workedMinutes)} />
                  <Figure label="Normal" value={formatDuration(week.normalMinutes)} />
                  <Figure
                    label="Compensation"
                    value={formatDuration(week.compensationMinutes)}
                  />
                  <Figure label="Overtime" value={formatDuration(week.overtimeMinutes)} />
                  <Figure
                    label="Shortfall"
                    value={formatDuration(week.shortfallMinutes)}
                  />
                  <Figure label="Balance" value={formatSigned(week.balanceMinutes)} />
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            These figures are produced by the same calculation the rest of the
            module uses, not typed in — so this page cannot describe behaviour
            the app does not have.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Not decided yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            These need the plant's answer before the module is finalised. The
            rules live in one place in the code, so changing them is a small
            edit rather than a rewrite.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              Whether a shortfall can carry into the following week, or is
              written off when the week closes. It is currently written off.
            </li>
            <li>
              Whether Sunday work is overtime by rule, or simply hours like any
              other. It currently counts as hours with no daily target.
            </li>
            <li>
              How a week straddling month end should be reported. Months
              currently take the weeks that begin in them, so no week is split.
            </li>
            <li>Public holidays, approved leave, and shift allowances.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Worked({
  in: timeIn,
  out,
  brk,
  result,
}: {
  in: string;
  out: string;
  brk: string;
  result: string;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5 text-[12px]">
      <div className="tabular-nums text-muted-foreground">
        {timeIn} → {out}
      </div>
      <div className="tabular-nums text-muted-foreground">break {brk}</div>
      <div className="mt-1 font-semibold tabular-nums">{result}</div>
    </div>
  );
}

function Rule({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <Badge variant="secondary">{label}</Badge>
      <p className="mt-1.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{label} </span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}
