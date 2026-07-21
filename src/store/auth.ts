import { create } from "zustand";
import type { Role, User } from "@/types";
import { repo } from "@/data";

const SESSION_KEY = "cpsr.session";

interface StoredSession {
  userId: string;
  remember: boolean;
}

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
      const user = await repo.login(email, password);
      if (!user) {
        set({ loading: false, error: "Invalid email or password." });
        return false;
      }
      const session: StoredSession = { userId: user.id, remember };
      const store = remember ? localStorage : sessionStorage;
      store.setItem(SESSION_KEY, JSON.stringify(session));
      // Clear the other store to avoid stale sessions.
      (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
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
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    set({ user: null });
  },

  restore: async () => {
    const raw =
      localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const session = JSON.parse(raw) as StoredSession;
      const users = await repo.listUsers();
      const user = users.find((u) => u.id === session.userId && u.active);
      if (user) set({ user });
      else get().logout();
    } catch {
      get().logout();
    }
  },

  refresh: async () => {
    const current = get().user;
    if (!current) return;
    const users = await repo.listUsers();
    const user = users.find((u) => u.id === current.id);
    if (user) set({ user });
  },
}));
