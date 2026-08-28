import { useMemo, useRef, useState } from "react";
import {
  Download,
  FileDown,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserPlus,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/csv";
import {
  employeeTemplateCsv,
  employeesToCsv,
  parseEmployeesCsv,
} from "@/lib/attendance/employeeCsv";
import { formatDayMonthYear } from "@/lib/attendance/calculations";
import { DEFAULT_SECTION } from "@/lib/attendance/sections";
import { awayOn, exitOf, isBooked, isLeaving, upper } from "@/lib/attendance/staff";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useAuth } from "@/store/auth";
import { DEPARTURE_LABELS, type Employee } from "@/types/attendance";
import type { Timesheets } from "./useTimesheets";
import { HistoryTab, StatusTab } from "./StatusTab";
import { PresenceBadge, departureTint } from "./shared";

interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * The staff list the timesheet is filled in against.
 *
 * Three lists behind one tab: who is on the books, what is booked against them,
 * and who has left. Nobody is ever deleted — a person whose exit date arrives
 * moves across on their own, and their timesheet history stays exactly where it
 * was, because the hours they worked are still hours the plant paid for.
 */
export function EmployeesTab({ sheets }: { sheets: Timesheets }) {
  const [view, setView] = useState<"staff" | "status" | "history">("staff");

  return (
    <div className="space-y-3">
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="staff">
            Staff
            <Count n={sheets.employees.length} />
          </TabsTrigger>
          <TabsTrigger value="status">
            Status
            <Count n={sheets.openDepartures.length} />
          </TabsTrigger>
          <TabsTrigger value="history">
            History
            <Count n={sheets.pastDepartures.length} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "staff" && <StaffList sheets={sheets} />}
      {view === "status" && <StatusTab sheets={sheets} />}
      {view === "history" && <HistoryTab sheets={sheets} />}
    </div>
  );
}

const Count = ({ n }: { n: number }) => (
  <span className="ml-1.5 text-xs opacity-70">{n}</span>
);

/** The people on the books today. */
function StaffList({ sheets }: { sheets: Timesheets }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The whole page is administrator-only today, but editing and deleting a
  // person is a different thing from reading the list, so it asks separately —
  // if Attendance is ever opened up, these stay shut.
  const isAdmin = useAuth((s) => s.user?.role === "admin");
  const isMobile = useIsMobile();

  const source = sheets.employees;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((e) => {
      if (department !== "all" && e.department !== department) return false;
      return !q || `${e.id} ${e.name} ${e.position}`.toLowerCase().includes(q);
    });
  }, [source, query, department]);

  const onDownloadTemplate = () => {
    downloadText("cpsm-employees-template.csv", employeeTemplateCsv());
    toast({
      variant: "success",
      title: "Template downloaded",
      description:
        "One row per employee — Emp ID, Name, Designation, Section, Status. " +
        "Delete the example rows, then use Import.",
    });
  };

  /** Everyone, current and left: an export nobody is missing from. */
  const onExport = () => {
    const all = [...sheets.employees, ...sheets.inactive];
    if (all.length === 0) {
      toast({ variant: "destructive", title: "There is nobody to export yet." });
      return;
    }
    downloadText("cpsm-employees.csv", employeesToCsv(all, sheets.presence));
    toast({
      variant: "success",
      title: `Exported ${all.length} employee${all.length === 1 ? "" : "s"}`,
      description: "The exported file is also a valid import file.",
    });
  };

  /**
   * Import a filled template.
   *
   * Every readable row is taken even when others fail, and the failures are
   * listed in full — a clerk loading a whole plant needs the complete list, not
   * the first bad line.
   */
  const onImport = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const { rows: people, errors } = parseEmployeesCsv(await file.text());
      const { added, updated } =
        people.length > 0
          ? sheets.importEmployees(people)
          : { added: 0, updated: 0 };
      setImportResult({ added, updated, skipped: errors.length, errors });
    } catch (e) {
      setImportResult({
        added: 0,
        updated: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : "The file could not be read."],
      });
    } finally {
      setImporting(false);
      // Allow re-picking the same file after a correction.
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Emp ID, name or designation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-9 w-[150px] sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sheets.departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {source.length}
        </span>

        {/* Bulk tools, grouped to the right so they read as maintenance rather
            than part of looking somebody up. */}
        {/* On a phone these lose their labels and become icons. Four buttons
            wide enough to read wrap into two ragged rows and push the list
            itself off the screen — and Template, Import, Export and a red bin
            are recognisable without being spelled out. Add staff keeps its
            words: it is the one thing somebody opens this tab to do. */}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:flex-wrap">
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="h-4 w-4" />
            Add staff
          </Button>

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
              show: true,
              disabled: false,
              danger: false,
            },
            {
              label: importing ? "Importing…" : "Import",
              icon: importing ? Loader2 : Upload,
              onClick: () => fileRef.current?.click(),
              show: true,
              disabled: importing,
              danger: false,
            },
            {
              label: "Export",
              icon: Download,
              onClick: onExport,
              show: true,
              disabled: false,
              danger: false,
            },
            {
              label: "Remove all",
              icon: Trash2,
              onClick: () => setConfirmClear(true),
              show: isAdmin,
              disabled: sheets.employees.length + sheets.inactive.length === 0,
              danger: true,
            },
          ]
            .filter((tool) => tool.show)
            .map((tool) => (
              <Button
                key={tool.label}
                variant="outline"
                // Icon-only still has to say what it is, or it says nothing at
                // all to a screen reader and nothing on hover either.
                aria-label={tool.label}
                title={isMobile ? tool.label : undefined}
                size={isMobile ? "icon" : "sm"}
                disabled={tool.disabled}
                className={cn(
                  isMobile && "h-9 w-9 shrink-0",
                  tool.danger &&
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
                onClick={tool.onClick}
              >
                <tool.icon
                  className={cn(
                    "h-4 w-4",
                    tool.icon === Loader2 && "animate-spin",
                  )}
                />
                {!isMobile && tool.label}
              </Button>
            ))}
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {rows.map((employee) => (
            <StaffCard
              key={employee.id}
              employee={employee}
              sheets={sheets}
              isAdmin={isAdmin}
              onEdit={() => setEditing(employee)}
            />
          ))}
          {rows.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <EmptyMessage filtered={source.length > 0} />
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Emp ID</TableHead>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  {isAdmin && <TableHead className="w-[90px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((employee) => (
                  <StaffRow
                    key={employee.id}
                    employee={employee}
                    sheets={sheets}
                    isAdmin={isAdmin}
                    onEdit={() => setEditing(employee)}
                  />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 6 : 5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      <EmptyMessage filtered={source.length > 0} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <StaffDialog
        open={adding}
        onOpenChange={setAdding}
        sheets={sheets}
        employee={null}
      />
      <StaffDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        sheets={sheets}
        employee={editing}
      />

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove all staff?</DialogTitle>
            <DialogDescription>
              This deletes all {sheets.employees.length + sheets.inactive.length}{" "}
              staff from the plant's records, with their departures, their
              timesheet rows and their posts on the org chart. Everyone sees it,
              and it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const n = sheets.employees.length + sheets.inactive.length;
                sheets.removeAllEmployees();
                setConfirmClear(false);
                toast({
                  variant: "success",
                  title: `Removed ${n} employee${n === 1 ? "" : "s"}`,
                });
              }}
            >
              Remove all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shown after every import, successful or not, so a partial load is
          never silent. */}
      <Dialog
        open={Boolean(importResult)}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import finished</DialogTitle>
            <DialogDescription>
              Rows are matched to existing staff by employee ID and updated in
              place. Nobody is removed by an import.
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Added", value: importResult.added },
                  { label: "Updated", value: importResult.updated },
                  { label: "Skipped", value: importResult.skipped },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-border bg-muted/30 p-3 text-center"
                  >
                    <div className="text-2xl font-bold tabular-nums">
                      {s.value}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-destructive">
                    {importResult.errors.length} row
                    {importResult.errors.length === 1 ? "" : "s"} could not be
                    imported
                  </p>
                  <div className="max-h-56 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 scrollbar-thin">
                    <ul className="space-y-1 text-xs text-destructive">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fix those rows and import the file again — the rows that
                    succeeded will simply be updated rather than duplicated.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One person, on a phone.
 *
 * The same row, stacked, because six columns on a 360px screen is either
 * unreadable or a sideways scroll — and a staff list you have to drag around is
 * one nobody checks. What a supervisor looks for here is a name and where that
 * person is, so those two are the top line and everything else is underneath.
 */
function StaffCard({
  employee,
  sheets,
  isAdmin,
  onEdit,
}: {
  employee: Employee;
  sheets: Timesheets;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className={cn(rowTint(employee, sheets))}>
      {/* One block, not stacked rows: the name, everything about the person on
          a single line under it, and the status and actions alongside. A staff
          list is something you scan, and every row that costs five lines is
          four people you cannot see at once. */}
      <CardContent className="flex items-start gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          {/* Wrapped to two lines rather than truncated. A staff list exists to
              be looked up by name, and "MOHAMED IHUSAAN ABDUL…" is not a name
              you can look anybody up by. Two lines is enough for every name the
              plant has and still a cap, so one long one cannot push the row to
              four. */}
          <div className="line-clamp-2 break-words text-[13px] font-medium leading-snug">
            {employee.name}
          </div>
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            <span className="font-mono">{employee.id}</span>
            {employee.department ? ` · ${employee.department}` : ""}
            {employee.position ? ` · ${employee.position}` : ""}
          </div>
          <RowNote employee={employee} sheets={sheets} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <PresenceBadge status={sheets.presence(employee)} />
          {/* The two actions read as a pair, so they sit as one: a gap between
              them only buys width the name could have had. */}
          {isAdmin && (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label={`Edit ${employee.name}`}
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${employee.name}`}
                onClick={() => removeWithNotice(employee, sheets)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The wash behind a highlighted person.
 *
 * A pending exit outranks a spell away, because it is the more consequential
 * news. Either way the wash is the colour of the thing causing it, so the row
 * and its badge agree — red for an exit, and never red for sick.
 */
function rowTint(employee: Employee, sheets: Timesheets): string | undefined {
  const { departures, today } = sheets;
  if (isLeaving(departures, employee.id, today)) return departureTint("exit");
  const away = awayOn(departures, employee.id, today);
  return away ? departureTint(away.type) : undefined;
}

/** Delete somebody, and say what that did and did not do. */
function removeWithNotice(employee: Employee, sheets: Timesheets) {
  sheets.removeEmployee(employee.id);
  toast({
    variant: "success",
    title: `${employee.name} removed`,
    description:
      "Their departures and timesheet rows went with them. For somebody who is actually leaving, book an Exit instead — that keeps the history.",
  });
}

/**
 * One person.
 *
 * The row is highlighted for a booked exit and for a spell away that has
 * started, and the caption under the name says which — the status badge cannot,
 * because for somebody working out their notice it still reads On site, which is
 * the truth.
 */
function StaffRow({
  employee,
  sheets,
  isAdmin,
  onEdit,
}: {
  employee: Employee;
  sheets: Timesheets;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  return (
    <TableRow className={cn(rowTint(employee, sheets))}>
      <TableCell className="font-mono text-xs">{employee.id}</TableCell>
      <TableCell>
        <div className="font-medium leading-tight">{employee.name}</div>
        <RowNote employee={employee} sheets={sheets} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {employee.department || "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {employee.position || "—"}
      </TableCell>
      <TableCell className="text-right">
        <PresenceBadge status={sheets.presence(employee)} />
      </TableCell>
      {isAdmin && (
        <TableCell>
          <div className="flex justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={`Edit ${employee.name}`}
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${employee.name}`}
              onClick={() => removeWithNotice(employee, sheets)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

/** The one line explaining why a row looks the way it does. */
function RowNote({
  employee,
  sheets,
}: {
  employee: Employee;
  sheets: Timesheets;
}) {
  const { departures, today } = sheets;
  const exit = exitOf(departures, employee.id);

  if (exit && today >= exit.from) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Left {formatDayMonthYear(exit.from)}
      </div>
    );
  }
  if (exit) {
    return (
      <div className="text-[11px] font-medium text-destructive">
        Leaving {formatDayMonthYear(exit.from)}
      </div>
    );
  }

  const away = awayOn(departures, employee.id, today);
  if (away) {
    return (
      <div className="text-[11px] font-medium text-warning">
        {DEPARTURE_LABELS[away.type]}
        {away.to ? ` until ${formatDayMonthYear(away.to)}` : ""}
      </div>
    );
  }

  // Booked but not started: said quietly, and with no row highlight.
  if (isBooked(departures, employee.id, today)) {
    const next = departures
      .filter((d) => d.employeeId === employee.id && today < d.from)
      .sort((a, b) => a.from.localeCompare(b.from))[0];
    return (
      <div className="text-[11px] text-muted-foreground">
        {DEPARTURE_LABELS[next.type]} booked from {formatDayMonthYear(next.from)}
      </div>
    );
  }
  return null;
}

function EmptyMessage({ filtered }: { filtered: boolean }) {
  if (filtered) return <>No employees match that search.</>;
  return (
    <>
      No staff yet. Use <span className="font-medium">Add staff</span> for one
      person, or <span className="font-medium">Template</span> and{" "}
      <span className="font-medium">Import</span> for a whole list.
    </>
  );
}

/**
 * Take one person on, or correct one already there.
 *
 * Everything typed is upper-cased as it is typed rather than quietly on save,
 * so what the form shows is what the list will show. The staff number is the key
 * timesheet rows are stored against, so it can be set once and not edited —
 * changing it would orphan every hour recorded against it.
 */
function StaffDialog({
  open,
  onOpenChange,
  sheets,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheets: Timesheets;
  employee: Employee | null;
}) {
  const editing = Boolean(employee);
  const [form, setForm] = useState({ id: "", name: "", position: "" });
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fill the fields the first time this opens for a given person, and let them
  // be typed in freely after that.
  const wanted = employee?.id ?? null;
  if (open && loadedFor !== wanted) {
    setLoadedFor(wanted);
    setForm({
      id: employee?.id ?? "",
      name: employee?.name ?? "",
      position: employee?.position ?? "",
    });
    setError(null);
  }

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const close = () => {
    setLoadedFor(null);
    setError(null);
    onOpenChange(false);
  };

  const save = () => {
    const id = upper(form.id);
    const name = upper(form.name);
    if (!id) {
      return setError(
        "An Emp ID is needed — it is what timesheet rows are stored against.",
      );
    }
    if (!name) return setError("A name is needed.");

    if (editing) {
      sheets.updateEmployee(employee!.id, { name, position: upper(form.position) });
      toast({ variant: "success", title: `${name} updated` });
      return close();
    }

    const result = sheets.addEmployee({
      id,
      name,
      position: upper(form.position),
      department: DEFAULT_SECTION,
    });
    if (result.error) return setError(result.error);

    toast({
      variant: "success",
      title: `${name} added`,
      description: `${id} now appears on the timesheet.`,
    });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit staff" : "Add staff"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "The Emp ID cannot change — timesheet rows are stored against it."
              : "One person. For a whole list, download the template and import it instead."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="staff-id">Emp ID</Label>
            <Input
              id="staff-id"
              placeholder="EMP ID"
              className="uppercase"
              disabled={editing}
              value={form.id}
              onChange={(e) => set({ id: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Name</Label>
            <Input
              id="staff-name"
              placeholder="FULL NAME"
              className="uppercase"
              value={form.name}
              onChange={(e) => set({ name: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-designation">Designation</Label>
            <Input
              id="staff-designation"
              placeholder="OPERATOR"
              className="uppercase"
              value={form.position}
              onChange={(e) => set({ position: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-department">Department</Label>
            {/* Fixed for now — nearly everybody is plant staff, and the few who
                are not come in through the import, which takes either. */}
            <Input
              id="staff-department"
              readOnly
              value={editing ? employee!.department : DEFAULT_SECTION}
              className="bg-muted/50 text-muted-foreground"
            />
          </div>

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
          <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
