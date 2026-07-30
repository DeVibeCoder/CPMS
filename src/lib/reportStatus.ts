import type { Report } from "@/types";

/**
 * Report status rules.
 *
 * A finalised report is a record, not a draft: it is what was signed off and
 * what the cement bin card carried forward, so it cannot be edited in place.
 * When the figures turn out to be wrong the way back is to revert it to draft —
 * an explicit, visible act — fix it, and finalise again.
 *
 * Centralised here so the guard on the edit route, the disabled Edit button and
 * the form's own check can never drift apart.
 */

export function isLocked(report: Pick<Report, "status">): boolean {
  return report.status === "final";
}

export function canEdit(report: Pick<Report, "status">): boolean {
  return !isLocked(report);
}

/** Message shown wherever an edit is refused. */
export const LOCKED_MESSAGE =
  "This report is final and cannot be edited. Revert it to draft first if the figures need correcting.";
