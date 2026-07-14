import { useEffect } from "react";
import { create } from "zustand";

interface PageMeta {
  title: string;
  description: string;
}

interface PageMetaState extends PageMeta {
  set: (meta: PageMeta) => void;
}

export const usePageMetaStore = create<PageMetaState>((set) => ({
  title: "",
  description: "",
  set: (meta) => set(meta),
}));

/**
 * Registers the current page's title + description so the top header can render
 * them. Call once near the top of each page component.
 */
export function usePageMeta(title: string, description: string) {
  const set = usePageMetaStore((s) => s.set);
  useEffect(() => {
    set({ title, description });
  }, [title, description, set]);
}
