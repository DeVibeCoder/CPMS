import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "cpsr.theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark());
}

const initialMode =
  (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
apply(initialMode);

export const useTheme = create<ThemeState>((set, get) => {
  // React to OS theme changes while in "system" mode.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (get().mode === "system") {
        apply("system");
        set({ isDark: resolveIsDark("system") });
      }
    });

  return {
    mode: initialMode,
    isDark: resolveIsDark(initialMode),
    setMode: (mode) => {
      localStorage.setItem(STORAGE_KEY, mode);
      apply(mode);
      set({ mode, isDark: resolveIsDark(mode) });
    },
    toggle: () => {
      const next = get().isDark ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      apply(next);
      set({ mode: next, isDark: resolveIsDark(next) });
    },
  };
});
