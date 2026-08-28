import { useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

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
import { Label } from "@/components/ui/label";
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
import { toast } from "@/hooks/use-toast";
import { formatDayMonthYear } from "@/lib/attendance/calculations";
import { hasExited } from "@/lib/attendance/staff";
import {
  DEPARTURE_LABELS,
  DEPARTURE_TYPES,
  type Departure,
  type DepartureType,
  type Employee,
} from "@/types/attendance";
import type { Timesheets } from "./useTimesheets";
import { DateField } from "./DateField";
import { DepartureBadge } from "./shared";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthLabel = (ym: string) => {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
};

/**
 * Status — vacations, sick spells, days off site, and exits.
 *
 * They are one screen rather than four because a supervisor writing any of them
 * down is doing the same thing: recording a date somebody will not be at work.
 * The only difference is that an exit has no end date.
 *
 * This tab holds what is running or still to come; History holds what has
 * finished. A row is in exactly one of them, and it crosses over on its own when
 * its date passes — nothing is copied, and editing here never writes there.
 */
export function StatusTab({ sheets }: { sheets: Timesheets }) {
  const [adding, setAdding] = useState(false);

  return (
    <DepartureList
      sheets={sheets}
      departures={sheets.openDepartures}
      empty={
        sheets.employees.length === 0
          ? "Add staff first — a departure is recorded against a person."
          : "Nothing running or booked. Use Add for a vacation, sick spell, day off site or an exit."
      }
      onRemove={(d) => {
        sheets.removeDeparture(d.id);
        toast({
          variant: "success",
          title: `${DEPARTURE_LABELS[d.type]} removed`,
        });
      }}
      action={
        <>
          <Button
            size="sm"
            className="ml-auto"
            disabled={sheets.employees.length === 0}
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
          <AddDepartureDialog
            open={adding}
            onOpenChange={setAdding}
            sheets={sheets}
          />
        </>
      }
    />
  );
}

/**
 * History — every departure ever recorded, read-only.
 *
 * Read-only on purpose: this is the record of what happened, and the place to
 * correct a mistake is the Status tab while it is still running. The staff
 * filter is what makes people who have left reachable at all — they are off the
 * staff list by design, so without it their record would be too.
 */
export function HistoryTab({ sheets }: { sheets: Timesheets }) {
  const [who, setWho] = useState<"all" | "current" | "left">("all");

  const filtered = useMemo(() => {
    if (who === "all") return sheets.pastDepartures;
    const gone = (id: string) => hasExited(sheets.departures, id, sheets.today);
    return sheets.pastDepartures.filter((d) =>
      who === "left" ? gone(d.employeeId) : !gone(d.employeeId),
    );
  }, [sheets.pastDepartures, sheets.departures, sheets.today, who]);

  return (
    <DepartureList
      sheets={sheets}
      departures={filtered}
      readOnly
      empty="Nothing has finished yet. A vacation, sick spell or day off site moves here the day after its To date; an exit moves here on the day it happens."
      action={
        <Select value={who} onValueChange={(v) => setWho(v as typeof who)}>
          <SelectTrigger className="ml-auto h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All staff</SelectItem>
            <SelectItem value="current">Current staff only</SelectItem>
            <SelectItem value="left">Staff who have left</SelectItem>
          </SelectContent>
        </Select>
      }
    />
  );
}

/** The table both tabs draw, with the search, type and month filters above it. */
function DepartureList({
  sheets,
  departures,
  empty,
  action,
  readOnly,
  onRemove,
}: {
  sheets: Timesheets;
  departures: Departure[];
  empty: string;
  action: React.ReactNode;
  readOnly?: boolean;
  onRemove?: (departure: Departure) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DepartureType | "all">("all");
  const [month, setMonth] = useState("all");

  const people = useMemo(
    () => new Map(sheets.roster.map((e) => [e.id, e])),
    [sheets.roster],
  );

  /** Only the months something is actually recorded in. */
  const months = useMemo(
    () =>
      [...new Set(departures.map((d) => d.from.slice(0, 7)))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [departures],
  );

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return departures
      .filter((d) => {
        if (type !== "all" && d.type !== type) return false;
        if (month !== "all" && d.from.slice(0, 7) !== month) return false;
        if (!q) return true;
        return `${d.employeeId} ${people.get(d.employeeId)?.name ?? ""}`
          .toUpperCase()
          .includes(q);
      })
      // By From date. Ascending on Status, so the next thing to happen is at the
      // top; descending on History, where the most recent is what gets looked up.
      .sort((a, b) =>
        readOnly ? b.from.localeCompare(a.from) : a.from.localeCompare(b.from),
      );
  }, [departures, people, query, type, month, readOnly]);

  const columns = readOnly ? 5 : 6;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Emp ID or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DEPARTURE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-9 w-[165px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {rows.length} of {departures.length}
        </span>

        {action}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Emp ID</TableHead>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[130px]">From</TableHead>
                  <TableHead className="w-[130px]">To</TableHead>
                  {!readOnly && <TableHead className="w-[60px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">
                      {d.employeeId}
                    </TableCell>
                    <TableCell className="font-medium">
                      {people.get(d.employeeId)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <DepartureBadge type={d.type} />
                    </TableCell>
                    {/* Shown the way the form is typed. A list in one format
                        and a field in another is how a March date gets entered
                        as a December one. */}
                    <TableCell className="tabular-nums">
                      {formatDayMonthYear(d.from)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {/* An exit has no return date, so the cell is simply a
                          dash — the same as any other column with nothing in
                          it, rather than a sentence explaining itself. */}
                      {d.type === "exit" || !d.to ? "—" : formatDayMonthYear(d.to)}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label="Remove"
                          onClick={() => onRemove?.(d)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}

                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {departures.length === 0 ? empty : "Nothing matches those filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Book a spell away or an exit, for a date that has usually not arrived yet. */
function AddDepartureDialog({
  open,
  onOpenChange,
  sheets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheets: Timesheets;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<DepartureType>("vacation");
  const [from, setFrom] = useState(sheets.today);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ranged = type !== "exit";
  const who = sheets.employees.find((e) => e.id === employeeId);

  const close = () => {
    setEmployeeId("");
    setType("vacation");
    setFrom(sheets.today);
    setTo("");
    setError(null);
    onOpenChange(false);
  };

  const save = () => {
    const result = sheets.addDeparture({
      employeeId,
      type,
      from,
      to: ranged && to ? to : undefined,
    });
    if (result.error) return setError(result.error);

    toast({
      variant: "success",
      title: `${DEPARTURE_LABELS[type]} recorded`,
      description:
        type === "exit"
          ? `${who?.name} moves off the staff list on ${formatDayMonthYear(from)}.`
          : from <= sheets.today
            ? `${who?.name} shows as ${DEPARTURE_LABELS[type]} now.`
            : `${who?.name} shows as ${DEPARTURE_LABELS[type]} from ${formatDayMonthYear(from)}.`,
    });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add departure</DialogTitle>
          <DialogDescription>
            Enter it when you are told. It takes effect on its own date. Dates
            are day-month-year — 25-12-2026.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <EmployeePicker
              employees={sheets.employees}
              value={employeeId}
              onChange={(id) => {
                setEmployeeId(id);
                setError(null);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DepartureType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTURE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-from">From</Label>
              <DateField id="dep-from" value={from} onChange={setFrom} />
            </div>
            {/* An exit has one date. The To field is dropped rather than shown
                disabled, so nothing invites a value that has no meaning. */}
            {ranged && (
              <div className="space-y-1.5">
                <Label htmlFor="dep-to">To</Label>
                <DateField id="dep-to" value={to} onChange={setTo} />
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {type === "exit"
              ? "The row is highlighted from now on, with the status left as it is. On that date they come off the staff list — the sheets keep every day they worked."
              : "Leave To blank for an open spell. The row is highlighted from the From date, not before."}
          </p>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pick a person by typing.
 *
 * Nothing drops down until something is typed. A list of four hundred names
 * opening on focus is not a menu anybody reads — it is a wall to scroll past on
 * the way to typing the name, which is what everyone does anyway. Matching runs
 * over the staff number and the name together, because whichever one somebody
 * has to hand is the one they will type.
 */
export function EmployeePicker({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const blurTimer = useRef<number>();

  const selected = employees.find((e) => e.id === value);
  const q = query.trim().toUpperCase();

  const matches = useMemo(
    () =>
      q
        ? employees
            .filter((e) => `${e.id} ${e.name}`.toUpperCase().includes(q))
            .slice(0, 8)
        : [],
    [employees, q],
  );

  // Typing is what opens it; picking somebody or leaving the field closes it.
  const open = q.length > 0 && !dismissed;

  const choose = (employee: Employee) => {
    onChange(employee.id);
    setQuery("");
    setDismissed(true);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={cn("pl-8", selected && !query && "font-medium")}
        placeholder={
          selected ? `${selected.id} — ${selected.name}` : "Type an Emp ID or name"
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
        }}
        // A click on an option blurs the input first, so closing is deferred
        // long enough for the click to land.
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setDismissed(true), 120);
        }}
      />

      {open && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md scrollbar-thin"
          onMouseDown={() => window.clearTimeout(blurTimer.current)}
        >
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  e.id === value && "bg-accent",
                )}
                onClick={() => choose(e)}
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {e.id}
                </span>
                <span className="truncate">{e.name}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              Nobody matches that.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
