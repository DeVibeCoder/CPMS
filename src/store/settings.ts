import { create } from "zustand";
import type { CompanySettings } from "@/types";
import { repo } from "@/data";

interface SettingsState {
  settings: CompanySettings | null;
  load: () => Promise<CompanySettings>;
  save: (patch: Partial<CompanySettings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    const existing = get().settings;
    if (existing) return existing;
    const s = await repo.getSettings();
    set({ settings: s });
    return s;
  },
  save: async (patch) => {
    const s = await repo.updateSettings(patch);
    set({ settings: s });
  },
}));
