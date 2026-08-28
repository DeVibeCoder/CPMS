import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HISTORY_DAYS, attendanceSource } from "@/data/attendance";
import { toast } from "@/hooks/use-toast";
import {
  entryKey as key,
  reconcileEntries,
  reconcileEntry,
} from "@/lib/attendance/autoStatus";
import { addDays, startOfWeek } from "@/lib/attendance/calculations";
import { PLANT_SECTIONS, normaliseSection } from "@/lib/attendance/sections";
import {
  departureFromPresence,
  hasExited,
  isOpenOn,
  presenceOf,
  upper,
  wasEmployedOn,
} from "@/lib/attendance/staff";
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
 * The plant's own records, in Supabase. What one supervisor enters is what
 * everybody else sees — which is the whole difference from the browser-local
 * working copy this module ran on while its rules were being settled.
 *
 * Every change is applied on screen first and sent immediately after. A
 * supervisor filling in thirty rows should not wait on a round trip per
 * keystroke, and the alternative — a Save button — is the thing that loses an
 * afternoon's work when somebody closes the tab. When a write fails the screen
 * is reloaded from the backend so that what is on it is true, and a message says
 * so: silently leaving an unsaved change on screen would be worse than the
 * error.
 */
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** How long a burst of typing is allowed to settle before it is sent. */
const FLUSH_DELAY = 700;

export interface Timesheets {
  loading: boolean;
  error: string | null;
  /**
   * Re-read everything from the backend.
   *
   * Not offered as a control on the page: this is what the module does when it
   * mounts, and what it does again to put the screen right after a write fails.
   * Somebody else's changes arrive the next time Attendance is opened, which is
   * how every other screen in the app behaves.
   */
  reload: () => void;
  /**
   * Everyone the sheets know about — people who have left included. The
   * timesheet and master sheet read this, because a person leaving must not
   * blank out the weeks they worked.
   */
  roster: Employee[];
  /** On the books today. This is the staff list. */
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
  /**
   * Write one day's rows from whatever is booked against each person.
   *
   * Covers the case the standing reconciliation cannot: a date nobody has
   * opened yet has no rows to correct, so the vacation has to be *created* the
   * first time the day is looked at. Safe to call repeatedly — it writes only
   * where the row and the booking disagree.
   */
  syncDay: (date: string) => void;
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
  /** Delete the whole staff list. */
  removeAllEmployees: () => void;
  /** Book a spell away or an exit, now or for a date weeks off. */
  addDeparture: (departure: Omit<Departure, "id">) => { error?: string };
  removeDeparture: (id: string) => void;
  /** Org chart slot id -> employee id. Absent keys are vacant posts. */
  chart: Record<string, string>;
  /** Put somebody in a post, or empty it with null. */
  assignSlot: (slotId: string, employeeId: string | null) => void;
  /** Dates with at least one entry, newest first. */
  dates: string[];
}

/** Whether a stored row and an on-screen row say the same thing. */
function same(a: TimesheetEntry, b: TimesheetEntry): boolean {
  return (
    a.status === b.status &&
    (a.start ?? "") === (b.start ?? "") &&
    (a.end ?? "") === (b.end ?? "") &&
    (a.remarks ?? "") === (b.remarks ?? "") &&
    Boolean(a.auto) === Boolean(b.auto) &&
    JSON.stringify(a.breaks ?? []) === JSON.stringify(b.breaks ?? [])
  );
}

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";

export function useTimesheets(): Timesheets {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<Employee[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [entries, setEntries] = useState<Map<string, TimesheetEntry>>(new Map());
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [chart, setChart] = useState<Record<string, string>>({});

  const today = attendanceSource.today();
  const since = useMemo(() => addDays(today, -HISTORY_DAYS), [today]);

  /**
   * What the backend is believed to hold.
   *
   * Timesheet rows are not saved by their call sites. They are changed from four
   * places — typing, the automatic status rule, opening a day, importing a list
   * — and threading a save through each was four chances to miss one. Instead
   * the flush below compares the rows on screen against this and sends the
   * difference, so a row cannot be changed without being saved.
   */
  const savedRef = useRef<Map<string, TimesheetEntry>>(new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const load = useCallback(async () => {
    const [people, bookings, rows, done, posts] = await Promise.all([
      attendanceSource.listEmployees(),
      attendanceSource.listDepartures(),
      attendanceSource.listEntries(since, today),
      attendanceSource.listSubmittedDates(since, today),
      attendanceSource.listChart(),
    ]);
    const byKey = new Map(rows.map((r) => [key(r.employeeId, r.date), r]));
    setRoster(people);
    setDepartures(bookings);
    setEntries(byKey);
    setSubmitted(new Set(done));
    setChart(posts);
    savedRef.current = new Map(byKey);
  }, [since, today]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(() => {
    setError(null);
    void load().catch((e) => setError(message(e)));
  }, [load]);

  /**
   * Run a change against the backend, and put the screen back if it fails.
   *
   * Reloading rather than reversing the one change: by the time a write fails
   * the screen may have moved on, and the only state that is certainly right is
   * the one the backend holds.
   */
  const run = useCallback(
    async (what: () => Promise<void>, failed: string) => {
      try {
        await what();
      } catch (e) {
        toast({
          variant: "destructive",
          title: failed,
          description: `${message(e)} The screen has been reloaded.`,
        });
        await load().catch(() => setError("Attendance could not be reloaded."));
      }
    },
    [load],
  );

  /**
   * Send whatever the rows on screen say that the stored ones do not.
   *
   * Debounced, because the alternative is a round trip for every character typed
   * into a remarks box.
   */
  const flush = useCallback(async () => {
    const current = entriesRef.current;
    const saved = savedRef.current;

    const changed: TimesheetEntry[] = [];
    for (const [id, entry] of current) {
      const before = saved.get(id);
      if (!before || !same(before, entry)) changed.push(entry);
    }
    const gone: { employeeId: string; date: string }[] = [];
    for (const [id, entry] of saved) {
      if (!current.has(id)) {
        gone.push({ employeeId: entry.employeeId, date: entry.date });
      }
    }
    if (changed.length === 0 && gone.length === 0) return;

    // Taken before the awaits: anything typed while they are in flight belongs
    // to the next flush, not to this one.
    const sent = new Map(current);
    await attendanceSource.saveEntries(changed);
    await attendanceSource.removeEntries(gone);
    savedRef.current = sent;
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void run(flush, "The timesheet could not be saved");
    }, FLUSH_DELAY);
    return () => window.clearTimeout(timer);
  }, [entries, loading, flush, run]);

  /** Forget rows the database has already removed, so no delete is sent. */
  const forgetSaved = useCallback((doomed: (entry: TimesheetEntry) => boolean) => {
    const next = new Map(savedRef.current);
    for (const [id, entry] of savedRef.current) if (doomed(entry)) next.delete(id);
    savedRef.current = next;
  }, []);

  const entryFor = useCallback(
    (employeeId: string, date: string) => entries.get(key(employeeId, date)),
    [entries],
  );

  const isSubmitted = useCallback(
    (date: string) => submitted.has(date),
    [submitted],
  );

  /**
   * Keep the timesheet in step with the Status tab, in both directions.
   *
   * Recording a vacation is one action, and it has to reach three screens: the
   * staff list, the org chart and the timesheet. The first two read the
   * departures directly and are never stale. The timesheet stores rows, and
   * those rows are what the master sheet and every total add up — so a booked
   * vacation has to be *written* onto the days it covers, and withdrawing it has
   * to take those days back off again.
   *
   * Runs on the departures rather than on the entries: an edit to a row is not
   * something to reconcile, and depending on the entries would have this write
   * to the state it reads. Rows for days nobody has opened yet are created by
   * `syncDay` when the day is first looked at. The rule itself lives in
   * `lib/attendance/autoStatus.ts`, where it can be tested without React.
   */
  useEffect(() => {
    if (loading) return;
    setEntries((current) => reconcileEntries(current, departures, isSubmitted));
  }, [loading, departures, isSubmitted]);

  const syncDay = useCallback(
    (date: string) => {
      // A completed day is a record. A departure entered afterwards does not
      // get to rewrite it — reopen the day to do that.
      if (submitted.has(date)) return;
      setEntries((current) => {
        let next: Map<string, TimesheetEntry> | null = null;
        for (const employee of roster) {
          if (!wasEmployedOn(departures, employee.id, date)) continue;
          const id = key(employee.id, date);
          const result = reconcileEntry(current.get(id), departures, employee.id, date);
          if (result.action === "keep") continue;
          next ??= new Map(current);
          if (result.action === "delete") next.delete(id);
          else next.set(id, result.entry);
        }
        return next ?? current;
      });
    },
    [roster, departures, submitted],
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
        // Typing hours into a row makes it somebody's own work: leaving the
        // flag on would let a later reconciliation delete what they had just
        // entered. A remark is not that — while a departure covers the day it is
        // the only field still enabled, and writing one is not a claim on the
        // day's status. Status itself never arrives here; it is settled entirely
        // by `lib/attendance/autoStatus.ts`.
        const claimed = "start" in patch || "end" in patch || "breaks" in patch;
        next.set(id, {
          ...existing,
          ...patch,
          ...(claimed ? { auto: undefined } : {}),
        });
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

      const merged = new Map(existing);
      for (const person of people) {
        const id = upper(person.id);
        const before = merged.get(id);
        // Stored upper case whatever the file used, so an HR export in title
        // case and a hand-typed row end up as one spelling.
        merged.set(id, {
          id: before?.id ?? id,
          name: upper(person.name),
          position: upper(person.position),
          department: normaliseSection(person.department),
        });
      }
      const next = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));

      // A file says where people are now. That replaces any open spell away it
      // contradicts, but leaves booked exits alone — the file has no column for
      // them, so it cannot be read as cancelling one.
      const touched = people.map(
        (p) => existing.get(p.id.toUpperCase())?.id ?? upper(p.id),
      );
      const fresh = people
        .map((p) =>
          departureFromPresence(
            existing.get(p.id.toUpperCase())?.id ?? upper(p.id),
            p.presence,
            today,
            newId(),
          ),
        )
        .filter((d): d is Departure => Boolean(d));

      setRoster(next);
      setDepartures((current) => {
        const replaced = new Set(touched);
        return [
          ...current.filter(
            (d) => d.type === "exit" || !replaced.has(d.employeeId),
          ),
          ...fresh,
        ];
      });

      void run(async () => {
        await attendanceSource.saveEmployees(next);
        await attendanceSource.replacePresence(touched, fresh);
      }, "The staff list could not be imported");

      return { added, updated: people.length - added };
    },
    [roster, today, run],
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
      void run(
        () => attendanceSource.saveEmployee(normalised),
        `${normalised.name} could not be added`,
      );
      return {};
    },
    [roster, run],
  );

  /** Correct a row. The staff number is the key, so it is not editable. */
  const updateEmployee = useCallback(
    (employeeId: string, patch: Partial<Employee>) => {
      let saved: Employee | undefined;
      setRoster((current) =>
        current.map((e) => {
          if (e.id !== employeeId) return e;
          saved = {
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
          };
          return saved;
        }),
      );
      if (saved) {
        const row = saved;
        void run(
          () => attendanceSource.saveEmployee(row),
          `${row.name} could not be saved`,
        );
      }
    },
    [run],
  );

  /**
   * Delete somebody outright.
   *
   * Their departures, timesheet rows and chart post go with them — the database
   * cascades all three, because hours keyed to a staff number nothing can
   * resolve are worse than losing them. This is the "entered by mistake" path; a
   * person who genuinely leaves gets an exit date and keeps their history.
   */
  const removeEmployee = useCallback(
    (employeeId: string) => {
      setRoster((current) => current.filter((e) => e.id !== employeeId));
      setDepartures((current) =>
        current.filter((d) => d.employeeId !== employeeId),
      );
      setEntries((current) => {
        const next = new Map(current);
        for (const [k, v] of current) if (v.employeeId === employeeId) next.delete(k);
        return next;
      });
      setChart((current) => {
        const held = Object.entries(current).find(([, id]) => id === employeeId);
        if (!held) return current;
        const next = { ...current };
        delete next[held[0]];
        return next;
      });
      // The cascade has already taken their rows, so the flush must not go
      // looking for them.
      forgetSaved((entry) => entry.employeeId === employeeId);
      void run(
        () => attendanceSource.removeEmployee(employeeId),
        "The employee could not be removed",
      );
    },
    [run, forgetSaved],
  );

  /**
   * Clear the whole staff list.
   *
   * How a plant starts again on a corrected list. Everything keyed to those
   * people goes with them — the database cascades their departures, timesheets
   * and chart posts.
   */
  const removeAllEmployees = useCallback(() => {
    setRoster([]);
    setDepartures([]);
    setEntries(new Map());
    setChart({});
    savedRef.current = new Map();
    void run(
      () => attendanceSource.removeAllEmployees(),
      "The staff list could not be cleared",
    );
  }, [run]);

  const addDeparture = useCallback(
    (departure: Omit<Departure, "id">): { error?: string } => {
      if (!departure.employeeId) return { error: "Pick who this is for." };
      if (!departure.from) return { error: "A date is needed." };
      if (departure.to && departure.to < departure.from) {
        return { error: "The To date is before the From date." };
      }
      const row: Departure = { ...departure, id: newId() };
      setDepartures((current) => [row, ...current]);
      void run(
        () => attendanceSource.saveDeparture(row),
        "The departure could not be saved",
      );
      return {};
    },
    [run],
  );

  const removeDeparture = useCallback(
    (id: string) => {
      setDepartures((current) => current.filter((d) => d.id !== id));
      void run(
        () => attendanceSource.removeDeparture(id),
        "The departure could not be removed",
      );
    },
    [run],
  );

  // The staff list and the inactive list are read off the roster against
  // today's date rather than stored, so somebody whose last day has arrived
  // moves across on their own. See `lib/attendance/staff.ts`.
  const employees = useMemo(
    () => roster.filter((e) => !hasExited(departures, e.id, today)),
    [roster, departures, today],
  );

  const inactive = useMemo(
    () => roster.filter((e) => hasExited(departures, e.id, today)),
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
   * happen would report a headcount the plant does not have — which is why the
   * table carries the same rule as a unique constraint.
   */
  const assignSlot = useCallback(
    (slotId: string, employeeId: string | null) => {
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
      void run(
        () => attendanceSource.assignSlot(slotId, employeeId),
        "The post could not be assigned",
      );
    },
    [run],
  );

  const dates = useMemo(
    () =>
      [...new Set([...entries.values()].map((e) => e.date))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [entries],
  );

  // The periods the master sheet offers are the periods there is something to
  // read, so they are derived from the sheets rather than declared anywhere.
  const weekStarts = useMemo(
    () => [...new Set(dates.map(startOfWeek))].sort((a, b) => b.localeCompare(a)),
    [dates],
  );

  const months = useMemo(
    () =>
      [...new Set(dates.map((d) => `${d.slice(0, 7)}-01`))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [dates],
  );

  const submitDate = useCallback(
    (date: string) => {
      setSubmitted((current) => new Set(current).add(date));
      void run(
        () => attendanceSource.submitDate(date),
        "The day could not be completed",
      );
    },
    [run],
  );

  const reopenDate = useCallback(
    (date: string) => {
      setSubmitted((current) => {
        const next = new Set(current);
        next.delete(date);
        return next;
      });
      void run(
        () => attendanceSource.reopenDate(date),
        "The day could not be reopened",
      );
    },
    [run],
  );

  return {
    loading,
    error,
    reload,
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
    syncDay,
    updateEntry,
    isSubmitted,
    submitDate,
    reopenDate,
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
    dates,
  };
}
