/**
 * The sections staff are posted to.
 *
 * Two, because that is what the company has: the plant itself and the office
 * that runs it. A fixed list rather than free text — letting the field drift
 * means "Cement Plant", "cement plant" and "CP" end up as three sections nobody
 * can filter or total across.
 *
 * Upper case for the same reason everything else on the staff list is: one
 * spelling, so a section reads the same wherever it appears.
 */
export const PLANT_SECTIONS = ["CEMENT PLANT", "ADMINISTRATION"] as const;

export type PlantSection = (typeof PLANT_SECTIONS)[number];

/**
 * Where somebody added through the form is posted.
 *
 * Fixed for now: nearly everybody is plant staff, and the handful who are not
 * come in through the import, which takes either section. When that stops being
 * true this becomes a dropdown over `PLANT_SECTIONS` and nothing else changes.
 */
export const DEFAULT_SECTION: PlantSection = "CEMENT PLANT";

/**
 * Fold a typed or imported section onto the fixed list.
 *
 * Anything unrecognised is kept as typed rather than forced — a file naming a
 * section that does not exist yet is a question for whoever sent it, not
 * something to silently relabel.
 */
export function normaliseSection(value: string): string {
  const upper = value.trim().toUpperCase();
  return PLANT_SECTIONS.find((s) => s === upper) ?? upper;
}
