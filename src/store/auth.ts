import { create } from "zustand";
import type { Role, User } from "@/types";
import { repo } from "@/data";
import { useSettings } from "./settings";
import { useReportFilters } from "./reportFilters";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<boolean>;
  logout: () => void;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** Role → permission capability map. Single source of truth for the UI guards. */
export const PERMISSIONS = {
  // Full access.
  admin: {
    deleteReports: true,
    manageUsers: true,
    settings: true,
    backup: true,
    createReports: true,
    editReports: true,
    exportPdf: true,
    // Working hours are staff records, and the plant has put them in the hands
    // of dispatch as well as administrators — dispatch is who is at the plant
    // when the shift starts, and a sheet only they can see somebody fill in is
    // a sheet filled in a day late. The row-level security on the attendance
    // tables names both roles too, where a REST client cannot get round it.
    attendance: true,
    // Replacing the staff list wholesale — importing over it, or clearing it —
    // is a different act from running attendance day to day, and the plant
    // keeps it with administrators.
    manageStaffList: true,
  },
  // Can create, edit and generate (print/export) reports — but not delete,
  // manage users, or change settings.
  dispatch: {
    deleteReports: false,
    manageUsers: false,
    settings: false,
    backup: false,
    createReports: true,
    editReports: true,
    exportPdf: true,
    // The whole module, not a read-only corner of it: dispatch adds staff,
    // books departures, fills in the timesheet, completes the day and assigns
    // posts on the chart. Splitting the day-to-day work finer would mean a
    // supervisor who could enter a vacation but not the hours it displaces.
    attendance: true,
    // The one exception, at the plant's request. Dispatch adds and corrects
    // people one at a time; the bulk tools that overwrite or empty the whole
    // staff list are not offered to them, because a mistake with those is not
    // a mistake in one row.
    //
    // A guard on the screen rather than in the database, deliberately: dispatch
    // may already add, correct and remove people one by one, so row-level
    // security has no line left to draw here that the per-row actions do not
    // already cross. What this prevents is the whole plant going in one click,
    // which is a foot-gun rather than a privilege.
    manageStaffList: false,
  },
  // Read-only. Can view everything but change nothing.
  viewer: {
    deleteReports: false,
    manageUsers: false,
    settings: false,
    backup: false,
    createReports: false,
    editReports: false,
    exportPdf: false,
    attendance: false,
    manageStaffList: false,
  },
} as const;

export type Capability = keyof (typeof PERMISSIONS)["admin"];

export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role) return false;
  return PERMISSIONS[role][cap];
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,

  login: async (email, password, remember) => {
    set({ loading: true, error: null });
    try {
      const user = await repo.login(email, password, remember);
      if (!user) {
        set({ loading: false, error: "Invalid email or password." });
        return false;
      }
      set({ user, loading: false, error: null });
      return true;
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Login failed.",
      });
      return false;
    }
  },

  logout: () => {
    // Fire-and-forget: the UI should never wait on a sign-out round trip.
    void repo.logout();
    useSettings.getState().clear();
    // Leaving the Reports section already resets this, but signing out must not
    // depend on which screen it happened from — the next person to sign in on
    // this browser starts at the current month either way.
    useReportFilters.getState().reset();
    set({ user: null });
  },

  // Rehydrate from whatever session the repository has persisted. Runs once at
  // startup, before the router decides whether to show the login page.
  restore: async () => {
    try {
      set({ user: await repo.getCurrentUser() });
    } catch {
      set({ user: null });
    }
  },

  refresh: async () => {
    if (!get().user) return;
    try {
      const user = await repo.getCurrentUser();
      if (user) set({ user });
    } catch {
      /* keep the current user rather than flickering the UI */
    }
  },
}));
