import type { Employee, TimesheetEntry } from "@/types/attendance";
import {
  MOCK_DEPARTMENTS,
  MOCK_EMPLOYEES,
  MOCK_ENTRIES,
  MOCK_MONTHS,
  MOCK_SUBMITTED_DATES,
  MOCK_TODAY,
  MOCK_WEEK_STARTS,
} from "./mockData";

/**
 * The Attendance module's only data access point.
 *
 * It mirrors `src/data/index.ts` deliberately: one interface, one export, and
 * nothing in the UI importing a concrete source. Today the only implementation
 * reads static mock data; when the plant signs off the rules, a Supabase
 * implementation slots in here and no page or component changes.
 *
 * The methods are async even though the mock answers instantly, so the UI is
 * written in a way that can survive a real network call rather than needing a
 * rewrite when one appears.
 */
export interface AttendanceSource {
  /** True while the module is running on invented data. */
  readonly isMock: boolean;
  listEmployees(): Promise<Employee[]>;
  listDepartments(): Promise<string[]>;
  listEntries(): Promise<TimesheetEntry[]>;
  /** Dates whose timesheet has been completed. */
  listSubmittedDates(): Promise<string[]>;
  listWeekStarts(): Promise<string[]>;
  listMonths(): Promise<string[]>;
  today(): string;
}

const mockSource: AttendanceSource = {
  isMock: true,
  today: () => MOCK_TODAY,
  async listEmployees() {
    return MOCK_EMPLOYEES;
  },
  async listDepartments() {
    return MOCK_DEPARTMENTS;
  },
  async listEntries() {
    return MOCK_ENTRIES;
  },
  async listSubmittedDates() {
    return MOCK_SUBMITTED_DATES;
  },
  async listWeekStarts() {
    return MOCK_WEEK_STARTS;
  },
  async listMonths() {
    return MOCK_MONTHS;
  },
};

export const attendanceSource: AttendanceSource = mockSource;

export type { Employee, TimesheetEntry };
