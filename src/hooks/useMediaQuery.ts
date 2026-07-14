import { useEffect, useState } from "react";

/** Reactive media-query hook used to drive the responsive layout tiers. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** Tailwind-aligned breakpoint helpers. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)"); // lg
export const useIsTabletUp = () => useMediaQuery("(min-width: 768px)"); // md
export const useIsMobile = () => !useMediaQuery("(min-width: 768px)");
