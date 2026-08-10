import { useEffect, useMemo, useState } from "react";
import { attendanceSource } from "@/data/attendance";
import type { AttendanceRecord, Employee } from "@/types/attendance";
import { addDays, startOfWeek } from "@/lib/attendance/calculations";

/**
 * Loads everything the Attendance screens need, once.
 *
 * The whole dataset is small enough to hold in memory and the tabs all slice
 * the same records, so fetching per tab would mean four round trips for data
 * that never changes between them. When this is wired to a real backend the
 * range below becomes the query window — which is why it is expressed as a
 * range rather than "everything".
 */
export interface AttendanceData {
  loading: boolean;
  error: string | null;
  employees: Employee[];
  departments: string[];
  records: AttendanceRecord[];
  weekStarts: string[];
  months: string[];
  today: string;
  /** Records for one employee, ascending by date. */
  recordsFor: (employeeId: string) => AttendanceRecord[];
}

export function useAttendance(): AttendanceData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [weekStarts, setWeekStarts] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  const today = attendanceSource.today();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const starts = await attendanceSource.listWeekStarts();
        // Widen the window to whole weeks so a month view never asks for a
        // partial week and reports a shortfall that is really missing data.
        const oldest = starts.length ? starts[starts.length - 1] : startOfWeek(today);
        const newest = addDays(startOfWeek(today), 6);

        const [people, depts, rows, monthList] = await Promise.all([
          attendanceSource.listEmployees(),
          attendanceSource.listDepartments(),
          attendanceSource.listRecords(oldest, newest),
          attendanceSource.listMonths(),
        ]);
        if (cancelled) return;
        setEmployees(people);
        setDepartments(depts);
        setRecords(rows);
        setWeekStarts(starts);
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
  }, [today]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>();
    for (const record of records) {
      const list = map.get(record.employeeId);
      if (list) list.push(record);
      else map.set(record.employeeId, [record]);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [records]);

  return {
    loading,
    error,
    employees,
    departments,
    records,
    weekStarts,
    months,
    today,
    recordsFor: (employeeId: string) => byEmployee.get(employeeId) ?? [],
  };
}
