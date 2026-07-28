import { create } from "zustand";
import type { CompanySettings } from "@/types";
import { repo } from "@/data";
import { DEFAULT_SETTINGS } from "@/data/defaults";

interface SettingsState {
  settings: CompanySettings | null;
  load: () => Promise<CompanySettings>;
  save: (patch: Partial<CompanySettings>) => Promise<void>;
  /** Forget cached settings — called on logout so the next user reloads them. */
  clear: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const existing = get().settings;
    if (existing) return existing;
    try {
      const s = await repo.getSettings();
      set({ settings: s });
      return s;
    } catch {
      // On Appwrite the settings table is only readable once signed in, so a
      // pre-login read is expected to fail. Fall back rather than block boot,
      // and leave `settings` null so it is fetched again after login.
      return { ...DEFAULT_SETTINGS };
    }
  },
  save: async (patch) => {
    const s = await repo.updateSettings(patch);
    set({ settings: s });
  },
  clear: () => set({ settings: null }),
}));
