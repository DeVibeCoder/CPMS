import type { Departure, Employee, TimesheetEntry } from "@/types/attendance";

/**
 * Keeping the attendance module's work across a reload.
 *
 * The module has no backend yet, so without this everything typed into it lives
 * until the next navigation — which is exactly what a clerk who has just
 * imported four hundred staff does next. Local storage is not a database and is
 * not shared between machines, but it is the difference between the module being
 * usable and being a demo.
 *
 * The stored shape is versioned. When the rules change, an old payload is
 * dropped rather than migrated: this is a session's working copy, not a record
 * of anything, and a half-understood old payload is worse than starting again.
 */
const KEY = "cpsm.attendance.v4";

export interface AttendanceState {
  employees: Employee[];
  departures: Departure[];
  entries: TimesheetEntry[];
  submitted: string[];
  /** Org chart slot id → employee id. Absent keys are vacant posts. */
  chart: Record<string, string>;
}

/**
 * Read the saved state back.
 *
 * Any failure — no storage, corrupt JSON, a shape that is not what this version
 * writes — returns null and lets the caller seed from the sample instead.
 * Attendance data is not worth a crash on load.
 */
export function loadState(): AttendanceState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const state = parsed as Partial<AttendanceState>;
    if (
      !Array.isArray(state.employees) ||
      !Array.isArray(state.departures) ||
      !Array.isArray(state.entries) ||
      !Array.isArray(state.submitted)
    ) {
      return null;
    }

    return {
      employees: state.employees,
      departures: state.departures,
      entries: state.entries,
      submitted: state.submitted,
      // Added after the first release of this key, so a payload written before
      // it simply has no assignments rather than being thrown away.
      chart:
        state.chart && typeof state.chart === "object" ? state.chart : {},
    };
  } catch {
    return null;
  }
}

/**
 * Write the state out.
 *
 * Silent on failure — a full or disabled storage must not take the screen down
 * mid-edit, and the user finds out at the next reload, which is the same thing
 * that happened before any of this existed.
 */
export function saveState(state: AttendanceState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable — the session carries on in memory */
  }
}

/** Throw the working copy away and fall back to the sample on next load. */
export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
