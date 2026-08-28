import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { toISODate } from "@/lib/attendance/calculations";
// The row shapes and the translation to and from them live in lib, not here:
// this file reaches for the Supabase client, and a mapping that imports nothing
// but types can be tested without one.
import {
  fromDeparture,
  fromEmployee,
  fromEntry,
  toDeparture,
  toEmployee,
  toEntry,
  type DepartureRow,
  type EmployeeRow,
  type EntryRow,
} from "@/lib/attendance/rows";
import type { Departure, Employee, TimesheetEntry } from "@/types/attendance";

/**
 * The Attendance module's only data access point.
 *
 * It mirrors `src/data/index.ts` deliberately: one interface, one export, and
 * nothing in the UI importing a concrete client. The module used to run on
 * invented data in local storage while its rules were being argued over; it now
 * reads and writes the plant's own records in Supabase, so what one supervisor
 * enters is what everybody sees.
 *
 * Everything is async, including the reads that feel instant, because every one
 * of them is a network call that can fail — and the screens above are written to
 * survive that rather than to assume it away.
 */
export interface AttendanceSource {
  /** Today, as the module reckons it. */
  today(): string;

  listEmployees(): Promise<Employee[]>;
  /** Add or correct one person, keyed on their staff number. */
  saveEmployee(employee: Employee): Promise<void>;
  /** Add or correct many, in one round trip. Used by the staff-list import. */
  saveEmployees(employees: Employee[]): Promise<void>;
  /**
   * Delete somebody outright, with everything keyed to them.
   *
   * The database cascades their departures, timesheet rows and chart post; this
   * is the "entered by mistake" path. Somebody who genuinely leaves gets an exit
   * date instead, which keeps their history.
   */
  removeEmployee(id: string): Promise<void>;
  /** Clear the whole staff list. Cascades exactly as `removeEmployee` does. */
  removeAllEmployees(): Promise<void>;

  listDepartures(): Promise<Departure[]>;
  saveDeparture(departure: Departure): Promise<void>;
  removeDeparture(id: string): Promise<void>;
  /**
   * Replace the open spells away for the named people.
   *
   * What an imported staff list means: the file says where everybody is *now*,
   * so it replaces any open spell it contradicts — but it has no column for an
   * exit, so it must not be read as cancelling one.
   */
  replacePresence(employeeIds: string[], fresh: Departure[]): Promise<void>;

  /** Every timesheet row from `from` to `to`, inclusive. */
  listEntries(from: string, to: string): Promise<TimesheetEntry[]>;
  saveEntries(entries: TimesheetEntry[]): Promise<void>;
  removeEntries(keys: { employeeId: string; date: string }[]): Promise<void>;

  listSubmittedDates(from: string, to: string): Promise<string[]>;
  submitDate(date: string): Promise<void>;
  reopenDate(date: string): Promise<void>;

  /** Org chart slot id -> employee id. Absent keys are vacant posts. */
  listChart(): Promise<Record<string, string>>;
  /** Put somebody in a post, or empty it with null. One post each way. */
  assignSlot(slotId: string, employeeId: string | null): Promise<void>;
}

export const TABLE_EMPLOYEES = "attendance_employees";
export const TABLE_DEPARTURES = "attendance_departures";
export const TABLE_ENTRIES = "attendance_entries";
export const TABLE_DAYS = "attendance_days";
export const TABLE_CHART = "attendance_chart";

/**
 * How far back the module loads.
 *
 * Attendance is a working record, not an archive: the timesheet is filled in
 * daily and the master sheet is read by week and by month. Loading every row
 * ever recorded would grow without bound for the sake of months nobody opens.
 * Six months covers any period a plant is still correcting or being paid on.
 */
export const HISTORY_DAYS = 183;

/**
 * Say what actually went wrong, with the table it went wrong on.
 *
 * A bare PostgREST message is often "new row violates row-level security
 * policy", which tells a supervisor nothing. Naming the operation at least
 * points whoever reads the toast at the right screen.
 */
function fail(what: string, error: PostgrestError): never {
  throw new Error(`${what}: ${error.message}`);
}

/**
 * Read a whole table through, a page at a time.
 *
 * PostgREST caps a response, and a plant of forty people fills six months with
 * several thousand timesheet rows — well past any single page. Paging here means
 * no caller has to know or care, and a silently truncated master sheet is not a
 * thing that can happen.
 */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: PostgrestError | null;
  }>,
  what: string,
): Promise<T[]> {
  const SIZE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += SIZE) {
    const { data, error } = await page(offset, offset + SIZE - 1);
    if (error) fail(what, error);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < SIZE) break;
  }
  return rows;
}

function createSource(client: SupabaseClient): AttendanceSource {
  return {
    today: () => toISODate(new Date()),

    // -- staff ---------------------------------------------------------------
    async listEmployees() {
      const rows = await readAll<EmployeeRow>(
        (from, to) =>
          client
            .from(TABLE_EMPLOYEES)
            .select("id,name,department,position")
            .order("id")
            .range(from, to),
        "The staff list could not be loaded",
      );
      return rows.map(toEmployee);
    },

    async saveEmployee(employee) {
      const { error } = await client
        .from(TABLE_EMPLOYEES)
        .upsert(fromEmployee(employee));
      if (error) fail("The employee could not be saved", error);
    },

    async saveEmployees(employees) {
      if (employees.length === 0) return;
      const { error } = await client
        .from(TABLE_EMPLOYEES)
        .upsert(employees.map(fromEmployee));
      if (error) fail("The staff list could not be imported", error);
    },

    async removeEmployee(id) {
      const { error } = await client.from(TABLE_EMPLOYEES).delete().eq("id", id);
      if (error) fail("The employee could not be removed", error);
    },

    async removeAllEmployees() {
      // `neq` on the key rather than an unfiltered delete: PostgREST refuses a
      // delete with no filter, which is a good rule to be held to.
      const { error } = await client
        .from(TABLE_EMPLOYEES)
        .delete()
        .neq("id", "");
      if (error) fail("The staff list could not be cleared", error);
    },

    // -- departures ----------------------------------------------------------
    async listDepartures() {
      const rows = await readAll<DepartureRow>(
        (from, to) =>
          client
            .from(TABLE_DEPARTURES)
            .select("id,employee_id,type,from_date,to_date")
            .order("from_date", { ascending: false })
            // Paging needs a total order or a page boundary can drop a row and
            // repeat another. Dates are not unique; the key is.
            .order("id")
            .range(from, to),
        "The departures could not be loaded",
      );
      return rows.map(toDeparture);
    },

    async saveDeparture(departure) {
      const { error } = await client
        .from(TABLE_DEPARTURES)
        .upsert(fromDeparture(departure));
      if (error) fail("The departure could not be saved", error);
    },

    async removeDeparture(id) {
      const { error } = await client
        .from(TABLE_DEPARTURES)
        .delete()
        .eq("id", id);
      if (error) fail("The departure could not be removed", error);
    },

    async replacePresence(employeeIds, fresh) {
      if (employeeIds.length > 0) {
        const { error } = await client
          .from(TABLE_DEPARTURES)
          .delete()
          .in("employee_id", employeeIds)
          .neq("type", "exit");
        if (error) fail("The old statuses could not be cleared", error);
      }
      if (fresh.length === 0) return;
      const { error } = await client
        .from(TABLE_DEPARTURES)
        .insert(fresh.map(fromDeparture));
      if (error) fail("The imported statuses could not be saved", error);
    },

    // -- timesheet -----------------------------------------------------------
    async listEntries(from, to) {
      const rows = await readAll<EntryRow>(
        (start, end) =>
          client
            .from(TABLE_ENTRIES)
            .select(
              "employee_id,date,start_time,end_time,breaks,status,remarks,auto",
            )
            .gte("date", from)
            .lte("date", to)
            .order("date")
            .order("employee_id")
            .range(start, end),
        "The timesheets could not be loaded",
      );
      return rows.map(toEntry);
    },

    async saveEntries(entries) {
      if (entries.length === 0) return;
      const { error } = await client
        .from(TABLE_ENTRIES)
        .upsert(entries.map(fromEntry));
      if (error) fail("The timesheet could not be saved", error);
    },

    async removeEntries(keys) {
      if (keys.length === 0) return;
      // A composite key has no clean `in` form, so the rows go one at a time.
      // There are never many: these are the rows a withdrawn departure leaves
      // behind, not a bulk operation.
      const results = await Promise.all(
        keys.map(({ employeeId, date }) =>
          client
            .from(TABLE_ENTRIES)
            .delete()
            .eq("employee_id", employeeId)
            .eq("date", date),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) fail("A timesheet row could not be removed", failed.error);
    },

    // -- sign-off ------------------------------------------------------------
    async listSubmittedDates(from, to) {
      const rows = await readAll<{ date: string }>(
        (start, end) =>
          client
            .from(TABLE_DAYS)
            .select("date")
            .gte("date", from)
            .lte("date", to)
            .order("date")
            .range(start, end),
        "The completed days could not be loaded",
      );
      return rows.map((r) => r.date);
    },

    async submitDate(date) {
      const { data } = await client.auth.getUser();
      const { error } = await client
        .from(TABLE_DAYS)
        .upsert({ date, submitted_by: data.user?.id ?? null });
      if (error) fail("The day could not be completed", error);
    },

    async reopenDate(date) {
      const { error } = await client.from(TABLE_DAYS).delete().eq("date", date);
      if (error) fail("The day could not be reopened", error);
    },

    // -- org chart -----------------------------------------------------------
    async listChart() {
      const rows = await readAll<{ slot_id: string; employee_id: string }>(
        (from, to) =>
          client
            .from(TABLE_CHART)
            .select("slot_id,employee_id")
            .order("slot_id")
            .range(from, to),
        "The organisational chart could not be loaded",
      );
      return Object.fromEntries(rows.map((r) => [r.slot_id, r.employee_id]));
    },

    async assignSlot(slotId, employeeId) {
      if (!employeeId) {
        const { error } = await client
          .from(TABLE_CHART)
          .delete()
          .eq("slot_id", slotId);
        if (error) fail("The post could not be emptied", error);
        return;
      }
      // One post each way, which the table enforces with a unique constraint —
      // so somebody moving posts has to leave the old one first, rather than
      // being counted twice for as long as both rows exist.
      const { error: cleared } = await client
        .from(TABLE_CHART)
        .delete()
        .eq("employee_id", employeeId);
      if (cleared) fail("The post could not be assigned", cleared);

      const { error } = await client
        .from(TABLE_CHART)
        .upsert({ slot_id: slotId, employee_id: employeeId });
      if (error) fail("The post could not be assigned", error);
    },
  };
}

/**
 * Stand-in for a missing configuration.
 *
 * `App` renders a setup screen when the backend is unconfigured, so this should
 * never be reached. It exists so a stray call fails loudly rather than resolving
 * with empty data and looking like an empty plant.
 */
function unconfigured(): AttendanceSource {
  const refuse = () => {
    throw new Error(
      "Attendance is not connected to a backend. Set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_ANON_KEY, then rebuild.",
    );
  };
  return new Proxy({} as AttendanceSource, {
    get(_target, key) {
      if (key === "today") return () => toISODate(new Date());
      return refuse;
    },
  });
}

export const attendanceSource: AttendanceSource = supabase
  ? createSource(supabase)
  : unconfigured();

export type { Departure, Employee, TimesheetEntry };
