import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attendanceSource } from "@/data/attendance";
import { PLANT_SECTIONS, normaliseSection } from "@/lib/attendance/sections";
import {
  departureFromPresence,
  hasExited,
  isOpenOn,
  presenceOf,
  upper,
} from "@/lib/attendance/staff";
import { clearState, loadState, saveState } from "@/lib/attendance/storage";
import type {
  Departure,
  Employee,
  PresenceStatus,
  TimesheetEntry,
} from "@/types/attendance";
import type { ParsedEmployee } from "@/lib/attendance/employeeCsv";

/**
 * Holds the timesheets the screens work on.
 *
 * Everything typed in is kept in local storage (see `lib/attendance/storage.ts`)
 * so a staff list survives leaving the page and coming back. It is still not a
 * backend: the data lives on the one machine, in the one browser, and the seam
 * that will eventually carry real data is `attendanceSource`.
 *
 * On a first visit — nothing stored — the sample is loaded so the timesheet and
 * master sheet have something to show.
 */
const key = (employeeId: string, date: string) => `${employeeId}|${date}`;

let departureSeq = 0;
const newDepartureId = () =>
  `dep-${Date.now().toString(36)}-${(departureSeq++).toString(36)}`;

export interface Timesheets {
  loading: boolean;
  error: string | null;
  /**
   * Everyone the sheets know about — the plant's own staff plus the sample
   * people, people who have left included. The timesheet and master sheet read
   * this, because a person leaving must not blank out the weeks they worked.
   */
  roster: Employee[];
  /** On the books today. This is the staff list, and it excludes the sample. */
  employees: Employee[];
  /** Left the plant. Kept, never deleted. */
  inactive: Employee[];
  /** Every booked spell away and every exit ever recorded. */
  departures: Departure[];
  /** Those still running or still to come — what the Status tab holds. */
  openDepartures: Departure[];
  /** Those that have finished — what History holds. The two never overlap. */
  pastDepartures: Departure[];
  /** The plant's sections. A fixed list; see `lib/attendance/sections.ts`. */
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
  /** Where somebody is right now, from their departures and today's row. */
  presence: (employee: Employee) => PresenceStatus;
  /**
   * Merge an imported staff list in, keyed on employee ID. Returns how many
   * people were new and how many already existed.
   */
  importEmployees: (people: ParsedEmployee[]) => { added: number; updated: number };
  /** Take on one person. Refuses a staff number already in use. */
  addEmployee: (employee: Employee) => { error?: string };
  /** Correct somebody's details. The staff number cannot change. */
  updateEmployee: (employeeId: string, patch: Partial<Employee>) => void;
  /**
   * Delete one person outright, with their departures and timesheet rows.
   *
   * Not the same as an exit: this is for a row entered by mistake. Somebody who
   * actually leaves gets an exit date, which keeps their history.
   */
  removeEmployee: (employeeId: string) => void;
  /** Delete every real employee. For clearing test data. */
  removeAllEmployees: () => void;
  /** Book a spell away or an exit, now or for a date weeks off. */
  addDeparture: (departure: Omit<Departure, "id">) => { error?: string };
  removeDeparture: (id: string) => void;
  /** Org chart slot id -> employee id. Absent keys are vacant posts. */
  chart: Record<string, string>;
  /** Put somebody in a post, or empty it with null. */
  assignSlot: (slotId: string, employeeId: string | null) => void;
  /** Throw the working copy away and reload the sample. */
  reset: () => void;
  /** Dates with at least one entry, newest first. */
  dates: string[];
}

export function useTimesheets(): Timesheets {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Employee[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [weekStarts, setWeekStarts] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [entries, setEntries] = useState<Map<string, TimesheetEntry>>(new Map());
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [chart, setChart] = useState<Record<string, string>>({});

  const today = attendanceSource.today();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // The week and month lists come from the sample either way: they are
        // the periods the master sheet offers, not anybody's data.
        const [weeks, monthList] = await Promise.all([
          attendanceSource.listWeekStarts(),
          attendanceSource.listMonths(),
        ]);
        if (cancelled) return;
        setWeekStarts(weeks);
        setMonths(monthList);

        const stored = loadState();
        if (stored) {
          setRoster(stored.employees);
          setDepartures(stored.departures);
          setEntries(
            new Map(stored.entries.map((r) => [key(r.employeeId, r.date), r])),
          );
          setSubmitted(new Set(stored.submitted));
          setChart(stored.chart ?? {});
          return;
        }

        const [people, rows, done] = await Promise.all([
          attendanceSource.listEmployees(),
          attendanceSource.listEntries(),
          attendanceSource.listSubmittedDates(),
        ]);
        if (cancelled) return;
        setRoster(people);
        setDepartures([]);
        setEntries(new Map(rows.map((r) => [key(r.employeeId, r.date), r])));
        setSubmitted(new Set(done));
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

  // Save on every change, but never during the first load — writing the sample
  // straight back out would turn "I have not used this yet" into stored state
  // and take away the reset the first visit gives for free.
  const hydrated = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveState({
      employees: roster,
      departures,
      entries: [...entries.values()],
      submitted: [...submitted],
      chart,
    });
  }, [loading, roster, departures, entries, submitted, chart]);

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

  /**
   * Merge an imported staff list into the one on screen.
   *
   * An upsert on employee ID rather than a replacement: re-importing a
   * corrected file fixes the same people instead of doubling them, and a file
   * covering one section does not delete the rest of the plant. An existing
   * person keeps their stored ID even if the file spells it in another case,
   * because timesheet entries are keyed on it and re-casing would orphan them.
   */
  const importEmployees = useCallback(
    (people: ParsedEmployee[]) => {
      const existing = new Map(roster.map((e) => [e.id.toUpperCase(), e]));
      const added = people.filter((p) => !existing.has(p.id.toUpperCase())).length;

      setRoster(() => {
        const merged = new Map(existing);
        for (const person of people) {
          const key = upper(person.id);
          const before = merged.get(key);
          // Stored upper case whatever the file used, so an HR export in title
          // case and a hand-typed row end up as one spelling.
          merged.set(key, {
            id: before?.id ?? key,
            name: upper(person.name),
            position: upper(person.position),
            department: normaliseSection(person.department),
            // Whatever this row was, somebody has now put a real person on it.
            sample: undefined,
          });
        }
        return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
      });

      // A file says where people are now. That replaces any open spell away it
      // contradicts, but leaves booked exits alone — the file has no column for
      // them, so it cannot be read as cancelling one.
      setDepartures((current) => {
        const touched = new Set(people.map((p) => p.id.toUpperCase()));
        const kept = current.filter(
          (d) => d.type === "exit" || !touched.has(d.employeeId.toUpperCase()),
        );
        const fresh = people
          .map((p) =>
            departureFromPresence(
              existing.get(p.id.toUpperCase())?.id ?? p.id,
              p.presence,
              today,
              newDepartureId(),
            ),
          )
          .filter((d): d is Departure => Boolean(d));
        return [...kept, ...fresh];
      });

      return { added, updated: people.length - added };
    },
    [roster, today],
  );

  /**
   * Take one person on.
   *
   * The staff number is the key everything else hangs off — timesheet rows are
   * stored against it — so handing a used one to a second person would silently
   * merge two people's hours. Refused rather than de-duplicated.
   */
  const addEmployee = useCallback(
    (employee: Employee): { error?: string } => {
      const id = upper(employee.id);
      const clash = roster.find((e) => upper(e.id) === id);
      if (clash) {
        return {
          error: `${clash.id} is already ${clash.name}. Staff numbers cannot be reused.`,
        };
      }

      const normalised: Employee = {
        id,
        name: upper(employee.name),
        position: upper(employee.position),
        department: normaliseSection(employee.department),
      };
      setRoster((current) =>
        [...current, normalised].sort((a, b) => a.id.localeCompare(b.id)),
      );
      return {};
    },
    [roster],
  );

  /** Correct a row. The staff number is the key, so it is not editable. */
  const updateEmployee = useCallback(
    (employeeId: string, patch: Partial<Employee>) => {
      setRoster((current) =>
        current.map((e) =>
          e.id === employeeId
            ? {
                ...e,
                ...patch,
                id: e.id,
                name: patch.name === undefined ? e.name : upper(patch.name),
                position:
                  patch.position === undefined ? e.position : upper(patch.position),
                department:
                  patch.department === undefined
                    ? e.department
                    : normaliseSection(patch.department),
              }
            : e,
        ),
      );
    },
    [],
  );

  /**
   * Delete somebody outright.
   *
   * Their departures and timesheet rows go with them: leaving those behind
   * would leave hours keyed to a staff number nothing can resolve, which is
   * worse than losing them. This is the "entered by mistake" path — a person
   * who genuinely leaves gets an exit date instead, and keeps their history.
   */
  const removeEmployee = useCallback((employeeId: string) => {
    setRoster((current) => current.filter((e) => e.id !== employeeId));
    setDepartures((current) =>
      current.filter((d) => d.employeeId !== employeeId),
    );
    setEntries((current) => {
      const next = new Map(current);
      for (const [k, v] of current) if (v.employeeId === employeeId) next.delete(k);
      return next;
    });
  }, []);

  /** Clear every real employee, leaving the sample sheets alone. */
  const removeAllEmployees = useCallback(() => {
    const doomed = new Set(roster.filter((e) => !e.sample).map((e) => e.id));
    setRoster((current) => current.filter((e) => e.sample));
    setDepartures((current) => current.filter((d) => !doomed.has(d.employeeId)));
    setEntries((current) => {
      const next = new Map(current);
      for (const [k, v] of current) if (doomed.has(v.employeeId)) next.delete(k);
      return next;
    });
  }, [roster]);

  const addDeparture = useCallback(
    (departure: Omit<Departure, "id">): { error?: string } => {
      if (!departure.employeeId) return { error: "Pick who this is for." };
      if (!departure.from) return { error: "A date is needed." };
      if (departure.to && departure.to < departure.from) {
        return { error: "The To date is before the From date." };
      }
      setDepartures((current) => [
        { ...departure, id: newDepartureId() },
        ...current,
      ]);
      return {};
    },
    [],
  );

  const removeDeparture = useCallback(
    (id: string) => setDepartures((current) => current.filter((d) => d.id !== id)),
    [],
  );

  // The staff list and the inactive list are read off the roster against
  // today's date rather than stored, so somebody whose last day has arrived
  // moves across on their own. See `lib/attendance/staff.ts`.
  const employees = useMemo(
    () => roster.filter((e) => !e.sample && !hasExited(departures, e.id, today)),
    [roster, departures, today],
  );

  const inactive = useMemo(
    () => roster.filter((e) => !e.sample && hasExited(departures, e.id, today)),
    [roster, departures, today],
  );

  // Status and History are the two halves of one list, split on the date rather
  // than copied: a row is in exactly one of them and crosses over on its own
  // when its To date passes — or, for an exit, on the day it happens.
  const openDepartures = useMemo(
    () => departures.filter((d) => isOpenOn(d, today)),
    [departures, today],
  );

  const pastDepartures = useMemo(
    () => departures.filter((d) => !isOpenOn(d, today)),
    [departures, today],
  );

  const presence = useCallback(
    (employee: Employee) =>
      presenceOf(employee, departures, entryFor(employee.id, today), today),
    [departures, entryFor, today],
  );

  /**
   * Put somebody in a post on the org chart, or empty it.
   *
   * One post each way: assigning somebody who already holds another post moves
   * them, rather than putting one person in two boxes. A chart that let that
   * happen would report a headcount the plant does not have.
   */
  const assignSlot = useCallback((slotId: string, employeeId: string | null) => {
    setChart((current) => {
      const next = { ...current };
      if (!employeeId) {
        delete next[slotId];
        return next;
      }
      for (const [id, held] of Object.entries(next)) {
        if (held === employeeId) delete next[id];
      }
      next[slotId] = employeeId;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearState();
    window.location.reload();
  }, []);

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
    roster,
    employees,
    inactive,
    departures,
    openDepartures,
    pastDepartures,
    departments: [...PLANT_SECTIONS],
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
    presence,
    importEmployees,
    addEmployee,
    updateEmployee,
    removeEmployee,
    removeAllEmployees,
    addDeparture,
    removeDeparture,
    chart,
    assignSlot,
    reset,
    dates,
  };
}
