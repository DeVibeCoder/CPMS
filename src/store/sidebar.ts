import { create } from "zustand";

const KEY = "cpsm.sidebar.collapsed";

interface SidebarState {
  /** User's preferred collapsed state on desktop (persisted). */
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem(KEY) === "true",
  toggle: () =>
    set((s) => {
      const next = !s.collapsed;
      localStorage.setItem(KEY, String(next));
      return { collapsed: next };
    }),
  setCollapsed: (v) => {
    localStorage.setItem(KEY, String(v));
    set({ collapsed: v });
  },
}));
