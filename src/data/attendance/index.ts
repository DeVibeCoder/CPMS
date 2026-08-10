import type { AttendanceRecord, Employee } from "@/types/attendance";
import {
  MOCK_DEPARTMENTS,
  MOCK_EMPLOYEES,
  MOCK_MONTHS,
  MOCK_RECORDS,
  MOCK_TODAY,
  MOCK_WEEK_STARTS,
} from "./mockData";

/**
 * The Attendance module's only data access point.
 *
 * It mirrors `src/data/index.ts` deliberately: one interface, one export, and
 * nothing in the UI importing a concrete source. Today the only implementation
 * reads static mock data; when the plant signs off the policy, a Supabase
 * implementation slots in here and no page or component changes.
 *
 * The methods are async even though the mock answers instantly. A synchronous
 * seam would let the UI be written in a way that quietly cannot survive a real
 * network call, which is the usual way "we'll wire the backend up later" turns
 * into a rewrite.
 */
export interface AttendanceSource {
  /** True while the module is running on invented data. */
  readonly isMock: boolean;
  listEmployees(): Promise<Employee[]>;
  listDepartments(): Promise<string[]>;
  /** Records between two ISO dates, inclusive. */
  listRecords(fromDate: string, toDate: string): Promise<AttendanceRecord[]>;
  /** Mondays that have data, newest first. */
  listWeekStarts(): Promise<string[]>;
  /** Months that have data, newest first, as YYYY-MM-01. */
  listMonths(): Promise<string[]>;
  /** The date the module treats as today. */
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
  async listRecords(fromDate, toDate) {
    return MOCK_RECORDS.filter((r) => r.date >= fromDate && r.date <= toDate);
  },
  async listWeekStarts() {
    return MOCK_WEEK_STARTS;
  },
  async listMonths() {
    return MOCK_MONTHS;
  },
};

export const attendanceSource: AttendanceSource = mockSource;

export type { AttendanceRecord, Employee };
