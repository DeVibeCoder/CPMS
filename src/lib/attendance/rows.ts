// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import type {
  AttendanceStatus,
  Departure,
  DepartureType,
  Employee,
  TimeBreak,
  TimesheetEntry,
} from "../../types/attendance.ts";

/**
 * The shape attendance takes in the database, and the way back.
 *
 * Columns are snake_case and the domain types are camelCase, so something has to
 * translate. Keeping it here rather than in `src/data/attendance` is what lets it
 * be tested: that file reaches for the Supabase client, and this one imports
 * nothing but types.
 *
 * The translation is not only naming. The database says "absent" with null; the
 * domain says it by leaving the property off, which is what lets `entry.start`
 * read as "no clock-in" rather than as a null somebody has to remember to check.
 * Round-tripping a row through both directions has to come back unchanged, and
 * the tests hold it to that.
 */

export interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  position: string;
}

export interface DepartureRow {
  id: string;
  employee_id: string;
  type: DepartureType;
  from_date: string;
  to_date: string | null;
}

export interface EntryRow {
  employee_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  breaks: TimeBreak[] | null;
  status: AttendanceStatus;
  remarks: string | null;
  auto: boolean;
}

export const toEmployee = (row: EmployeeRow): Employee => ({
  id: row.id,
  name: row.name,
  department: row.department,
  position: row.position,
});

export const fromEmployee = (employee: Employee): EmployeeRow => ({
  id: employee.id,
  name: employee.name,
  department: employee.department,
  position: employee.position,
});

export const toDeparture = (row: DepartureRow): Departure => ({
  id: row.id,
  employeeId: row.employee_id,
  type: row.type,
  from: row.from_date,
  // An exit has no end, and neither has an open-ended spell. Both are the
  // absence of a To date rather than a null one.
  ...(row.to_date ? { to: row.to_date } : {}),
});

export const fromDeparture = (departure: Departure): DepartureRow => ({
  id: departure.id,
  employee_id: departure.employeeId,
  type: departure.type,
  from_date: departure.from,
  to_date: departure.to ?? null,
});

export const toEntry = (row: EntryRow): TimesheetEntry => ({
  employeeId: row.employee_id,
  date: row.date,
  ...(row.start_time ? { start: row.start_time } : {}),
  ...(row.end_time ? { end: row.end_time } : {}),
  // An empty array and no gaps at all are the same day, so only a real list
  // survives the trip. Otherwise every untouched row would come back looking
  // edited to the change detector that decides what to save.
  ...(row.breaks?.length ? { breaks: row.breaks } : {}),
  status: row.status,
  ...(row.remarks ? { remarks: row.remarks } : {}),
  ...(row.auto ? { auto: true } : {}),
});

export const fromEntry = (entry: TimesheetEntry): EntryRow => ({
  employee_id: entry.employeeId,
  date: entry.date,
  start_time: entry.start ?? null,
  end_time: entry.end ?? null,
  breaks: entry.breaks ?? [],
  status: entry.status,
  // A remarks box somebody typed into and cleared again holds "", which is not
  // a remark. Stored as null so it reads the same as never having had one.
  remarks: entry.remarks?.trim() ? entry.remarks : null,
  auto: entry.auto === true,
});
