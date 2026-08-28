// Relative, with the extension, rather than the "@/" alias: this file is loaded
// by the test script under Node as well as bundled by Vite, and Node cannot
// resolve the alias. See `calculations.ts` next door.
import { parseDayMonthYear } from "./calculations.ts";

/**
 * A date field as eight boxes and two fixed slashes.
 *
 * The separators are part of the field rather than something anybody types.
 * What is on screen is always dd/mm/yyyy — with the letters standing in for
 * digits not yet entered — so the shape of the answer is visible before the
 * first keystroke, and the slashes never move.
 *
 * Modelled as eight slots rather than as a string because the string is a
 * *rendering*. Editing the text directly is where masked fields go wrong:
 * deleting a separator, or typing into the middle, means re-deriving the digits
 * from a string that no longer has a fixed shape, and the digits shuffle. Eight
 * slots and a caret that moves between them cannot shuffle.
 *
 * The rules live here, apart from React, so they can be tested by running them.
 */

/** Day, month, year: where each begins in the slots and on screen. */
export const DATE_SEGMENTS = [
  { slot: 0, length: 2, at: 0, fill: "d" },
  { slot: 2, length: 2, at: 3, fill: "m" },
  { slot: 4, length: 4, at: 6, fill: "y" },
] as const;

export const EMPTY_SLOTS: string[] = Array(8).fill("");

/** What the field shows: filled digits, and letters where none has been typed. */
export function render(slots: string[]): string {
  return DATE_SEGMENTS.map((segment) =>
    Array.from({ length: segment.length }, (_, i) =>
      slots[segment.slot + i] || segment.fill,
    ).join(""),
  ).join("/");
}

/** Which of the three the caret at this screen position belongs to. */
export function segmentAt(caret: number): number {
  // The separator after a segment belongs to it, so clicking the slash next to
  // the day selects the day rather than jumping forward a segment.
  const index = DATE_SEGMENTS.findIndex(
    (segment) => caret <= segment.at + segment.length,
  );
  return index === -1 ? DATE_SEGMENTS.length - 1 : index;
}

/** Where a segment sits on screen, for selecting the whole of it. */
export function segmentRange(index: number): [number, number] {
  const segment = DATE_SEGMENTS[index];
  return [segment.at, segment.at + segment.length];
}

/** The slots for a stored date, or empty ones when there is no date. */
export function slotsFor(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return [...EMPTY_SLOTS];
  const [, year, month, day] = match;
  return [...day, ...month, ...year];
}

/**
 * The date the slots add up to, or "" when they do not add up to one.
 *
 * Partly filled is not a date, and neither is 31/02/2026 — the same rule the
 * typed parser applies, reached through it so there is only one place that
 * decides what a real day is.
 */
export function dateFrom(slots: string[]): string {
  if (slots.some((slot) => !slot)) return "";
  return parseDayMonthYear(render(slots)) ?? "";
}

/** Every slot empty. An untouched field, and a cleared one. */
export const isBlank = (slots: string[]): boolean =>
  slots.every((slot) => !slot);

/**
 * Where a typed digit goes, and where the caret ends up after it.
 *
 * The cursor counts boxes *filled* in the current segment, so it runs from 0 to
 * the segment's length inclusive — length meaning "this one is full and the
 * caret is past it". That last position matters: without it the caret parks on
 * the final box of the year, and backspace deletes the box behind the caret and
 * so can never reach the digit actually on screen.
 *
 * Filling the last box of a segment moves to the next one, which is what makes
 * the field feel like the native control: eight digits, no thinking about where
 * they land. The year has nothing after it, so a ninth digit is dropped — the
 * date is complete, and silently rewriting a finished date because somebody
 * leaned on a key is not a kindness. Clicking the year selects it and starts it
 * again, which is the way to correct one.
 */
export function typeDigit(
  slots: string[],
  segment: number,
  cursor: number,
  digit: string,
): { slots: string[]; segment: number; cursor: number } {
  const here = DATE_SEGMENTS[segment];
  if (cursor >= here.length) return { slots, segment, cursor };

  const next = [...slots];
  next[here.slot + cursor] = digit;
  const filled = cursor + 1;

  // Full, and there is somewhere to go: step onto the next segment.
  if (filled === here.length && segment + 1 < DATE_SEGMENTS.length) {
    return { slots: next, segment: segment + 1, cursor: 0 };
  }
  return { slots: next, segment, cursor: filled };
}

/**
 * Delete backwards.
 *
 * Clears the box behind the caret and steps onto it, crossing back into the
 * previous segment when there is nothing left in this one — so holding backspace
 * empties the field right to left and stops, rather than getting stuck on a
 * separator the way a text mask does.
 */
export function deleteBack(
  slots: string[],
  segment: number,
  cursor: number,
): { slots: string[]; segment: number; cursor: number } {
  const next = [...slots];

  if (cursor > 0) {
    next[DATE_SEGMENTS[segment].slot + cursor - 1] = "";
    return { slots: next, segment, cursor: cursor - 1 };
  }
  if (segment > 0) {
    const before = DATE_SEGMENTS[segment - 1];
    next[before.slot + before.length - 1] = "";
    return { slots: next, segment: segment - 1, cursor: before.length - 1 };
  }
  // The first box of the day. Clear it and stay put.
  next[0] = "";
  return { slots: next, segment: 0, cursor: 0 };
}

/** Step one segment left or right, without changing anything. */
export function step(segment: number, by: number): number {
  return Math.min(Math.max(segment + by, 0), DATE_SEGMENTS.length - 1);
}
