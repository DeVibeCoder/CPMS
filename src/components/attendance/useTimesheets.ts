import { useCallback, useEffect, useMemo, useState } from "react";
import { attendanceSource } from "@/data/attendance";
import type { Employee, TimesheetEntry } from "@/types/attendance";

/**
 * Holds the timesheets the screens work on.
 *
 * Edits and completed days live in memory for the length of the session. There
 * is deliberately no persistence: the module is under development and not
 * connected to anything, and writing to storage would create a second, invisible
 * copy of the data that later has to be reconciled with a real backend.
 *
 * A reviewer can therefore change a day, complete it, and see it appear in the
 * master sheet — and a reload puts everything back to the sample.
 */
const key = (employeeId: string, date: string) => `${employeeId}|${date}`;

export interface Timesheets {
  loading: boolean;
  error: string | null;
  employees: Employee[];
  departments: string[];
  weekStarts: string[];
  months: string[];
  today: string;
  entryFor: (employeeId: string, date: string) => TimesheetEntry | undefined;
  updateEntry: (
    employeeId: string,
    date: string,
    patch: Partial<TimesheetEntry>,
  ) => void;
  isSubmitted: (date: string) => boolean;
  submitDate: (date: string) => void;
  reopenDate: (date: string) => void;
  /** Dates with at least one entry, newest first. */
  dates: string[];
}

export function useTimesheets(): Timesheets {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [weekStarts, setWeekStarts] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [entries, setEntries] = useState<Map<string, TimesheetEntry>>(new Map());
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const today = attendanceSource.today();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [people, depts, rows, done, weeks, monthList] = await Promise.all([
          attendanceSource.listEmployees(),
          attendanceSource.listDepartments(),
          attendanceSource.listEntries(),
          attendanceSource.listSubmittedDates(),
          attendanceSource.listWeekStarts(),
          attendanceSource.listMonths(),
        ]);
        if (cancelled) return;
        setEmployees(people);
        setDepartments(depts);
        setEntries(new Map(rows.map((r) => [key(r.employeeId, r.date), r])));
        setSubmitted(new Set(done));
        setWeekStarts(weeks);
        setMonths(monthList);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load attendance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const entryFor = useCallback(
    (employeeId: string, date: string) => entries.get(key(employeeId, date)),
    [entries],
  );

  const updateEntry = useCallback(
    (employeeId: string, date: string, patch: Partial<TimesheetEntry>) => {
      setEntries((current) => {
        const next = new Map(current);
        const id = key(employeeId, date);
        const existing = next.get(id) ?? {
          employeeId,
          date,
          status: "present" as const,
        };
        next.set(id, { ...existing, ...patch });
        return next;
      });
    },
    [],
  );

  const dates = useMemo(
    () =>
      [...new Set([...entries.values()].map((e) => e.date))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [entries],
  );

  return {
    loading,
    error,
    employees,
    departments,
    weekStarts,
    months,
    today,
    entryFor,
    updateEntry,
    isSubmitted: (date: string) => submitted.has(date),
    submitDate: (date: string) =>
      setSubmitted((current) => new Set(current).add(date)),
    reopenDate: (date: string) =>
      setSubmitted((current) => {
        const next = new Set(current);
        next.delete(date);
        return next;
      }),
    dates,
  };
}
