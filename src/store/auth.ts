import { create } from "zustand";
import type { Role, User } from "@/types";
import { repo } from "@/data";
import { useSettings } from "./settings";

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
