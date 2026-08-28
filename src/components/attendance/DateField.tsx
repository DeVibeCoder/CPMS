import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatDayMonthYear,
  parseDayMonthYear,
} from "@/lib/attendance/calculations";

/**
 * A date, typed, in the order the plant writes it: 25-12-2026.
 *
 * Deliberately not `<input type="date">`, for the same reason `TimeField` is not
 * `<input type="time">`. That control renders in the machine's locale, so the
 * same field shows 03/12 to one clerk and 12/03 to the next with nothing on
 * screen to say which — and between a day in March and a day in December that is
 * not a cosmetic difference. It is worse here than for times, because a
 * misread time looks wrong and a misread date does not.
 *
 * An unreadable date is left on screen to be corrected rather than being
 * discarded or rounded to something real, and the field says so in red. What
 * counts as readable lives in `calculations.ts` beside the rest of the date
 * handling, and is tested there.
 */
export function DateField({
  value,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  /** ISO, YYYY-MM-DD. Empty for no date. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => (value ? formatDayMonthYear(value) : ""));

  // Follow the stored value when it changes underneath — the form was reset, or
  // the date was set from somewhere else.
  useEffect(() => {
    setText(value ? formatDayMonthYear(value) : "");
  }, [value]);

  const commit = () => {
    if (!text.trim()) {
      setText("");
      onChange("");
      return;
    }
    const iso = parseDayMonthYear(text);
    if (iso) {
      setText(formatDayMonthYear(iso));
      onChange(iso);
    }
    // Unreadable: leave it on screen so it can be corrected.
  };

  const unreadable = Boolean(text.trim()) && parseDayMonthYear(text) === null;

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder="dd-mm-yyyy"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cn("tabular-nums", unreadable && "border-destructive text-destructive", className)}
    />
  );
}
