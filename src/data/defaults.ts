import type { CompanySettings } from "@/types";

/**
 * Shipped defaults.
 *
 * Company and PDF branding are no longer settings — see `src/config/brand.ts`.
 * What remains is genuine per-deployment preference.
 */
export const DEFAULT_SETTINGS: CompanySettings = {
  defaultTheme: "system",
};
