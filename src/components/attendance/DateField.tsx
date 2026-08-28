import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  digitRunAt,
  formatDayMonthYear,
  maskDayMonthYear,
  parseDayMonthYear,
} from "@/lib/attendance/calculations";

/**
 * A date, typed, in the order the plant writes it: 25/12/2026.
 *
 * Deliberately not `<input type="date">`, for the same reason `TimeField` is not
 * `<input type="time">`. That control renders in the machine's locale, so the
 * same field shows 03/12 to one clerk and 12/03 to the next with nothing on
 * screen to say which — and between a day in March and a day in December that is
 * not a cosmetic difference. It is worse here than for times, because a misread
 * time looks wrong and a misread date does not.
 *
 * What the native control does get right is that you type digits and it deals
 * with the rest: separators appear on their own, and clicking the month selects
 * the month so the next keystroke replaces it. Both are worth keeping and both
 * are kept — see `onType` and `onSelectSegment`. Giving up the locale problem
 * was the point; giving up the editing behaviour with it was not.
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
  const ref = useRef<HTMLInputElement>(null);
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

  /**
   * Take what was typed, and put the separators in.
   *
   * Only when the edit is an append at the end of the field. Anywhere else — a
   * segment replaced, a digit deleted from the middle — the text is taken as it
   * comes, because re-deriving it from the digits would repack them: replace the
   * month in 25/12/2026 with a single 7 and 25/7/2026 would be rebuilt as
   * 25/72/026. The parser is content with 25/7/2026, so there is nothing to fix
   * and every reason not to try.
   */
  const onType = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const appended =
      typed.length > text.length &&
      event.target.selectionStart === typed.length;
    setText(appended ? maskDayMonthYear(typed) : typed);
  };

  /**
   * Select the whole day, month or year the caret landed in.
   *
   * Skipped when the selection is not collapsed, because that is somebody
   * dragging out a selection of their own and taking it off them would be
   * worse than not helping at all.
   */
  const onSelectSegment = () => {
    const field = ref.current;
    if (!field || field.disabled) return;
    const { selectionStart, selectionEnd } = field;
    if (selectionStart === null || selectionStart !== selectionEnd) return;

    const run = digitRunAt(field.value, selectionStart);
    if (run) field.setSelectionRange(run[0], run[1]);
  };

  const unreadable = Boolean(text.trim()) && parseDayMonthYear(text) === null;

  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder="dd/mm/yyyy"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      onChange={onType}
      // `mouseUp`, not `click`: the browser places the caret between the two, so
      // this is the first moment there is a caret position worth reading.
      onMouseUp={onSelectSegment}
      onFocus={onSelectSegment}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cn(
        "tabular-nums",
        unreadable && "border-destructive text-destructive",
        className,
      )}
    />
  );
}
