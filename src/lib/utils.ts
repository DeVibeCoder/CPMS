import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators. Returns "0" for nullish. */
export function formatNumber(
  value: number | null | undefined,
  opts: { decimals?: number } = {},
): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Parse a possibly-formatted string ("1,200.50") into a number. */
export function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Sum an array of numbers safely. */
export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

/** Short unique id (sufficient for a JSON store). */
export function uid(prefix = ""): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

/** Simple initials helper for avatars. */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

/** Human-readable role label. */
export function roleLabel(role: "admin" | "dispatch" | "viewer"): string {
  switch (role) {
    case "admin":
      return "Administrator";
    case "dispatch":
      return "Dispatch";
    case "viewer":
      return "Viewer";
  }
}

/** One-line description of what a role can do (used in the Users form). */
export function roleDescription(role: "admin" | "dispatch" | "viewer"): string {
  switch (role) {
    case "admin":
      return "Full access — reports, users, settings and backups.";
    case "dispatch":
      return "Create, edit and generate reports. View only otherwise.";
    case "viewer":
      return "Read-only access to reports and dashboards.";
  }
}
