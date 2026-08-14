import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseTyped } from "@/lib/attendance/calculations";

/**
 * A clock time, typed, in 24-hour form.
 *
 * Deliberately not `<input type="time">`. That control renders in the machine's
 * locale, which on most of these machines means a 12-hour field with an AM/PM
 * segment and a clock icon that opens a picker — three things to tab through to
 * enter a number somebody already knows. A plant works in 24-hour time and a
 * clerk filling thirty rows wants to type "0700" and move on.
 *
 * What counts as a readable time lives in `calculations.ts` beside the rest of
 * the time handling, and is tested there.
 */
export function TimeField({
  value,
  onChange,
  disabled,
  className,
  label,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value ?? "");

  // Follow the stored value when it changes underneath — a different day was
  // picked, or the row was filled in from somewhere else.
  useEffect(() => setText(value ?? ""), [value]);

  const commit = () => {
    if (!text.trim()) {
      setText("");
      onChange(undefined);
      return;
    }
    const parsed = parseTyped(text);
    if (parsed) {
      setText(parsed);
      onChange(parsed);
    }
    // Unreadable: leave it on screen so it can be corrected.
  };

  const unreadable = Boolean(text.trim()) && parseTyped(text) === null;

  return (
    <div>
      {label && (
        <div className="mb-0.5 text-[10px] uppercase text-muted-foreground">
          {label}
        </div>
      )}
      <Input
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder="--:--"
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={cn(
          "h-8 px-2 text-center tabular-nums",
          unreadable && "border-destructive text-destructive",
          className,
        )}
      />
    </div>
  );
}
