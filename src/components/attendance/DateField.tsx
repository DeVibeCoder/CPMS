import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DATE_SEGMENTS,
  dateFrom,
  deleteBack,
  isBlank,
  render,
  segmentAt,
  segmentRange,
  slotsFor,
  step,
  typeDigit,
} from "@/lib/attendance/dateMask";

/**
 * A date, typed, in the order the plant writes it: 25/12/2026.
 *
 * Deliberately not `<input type="date">`. That control renders in the machine's
 * locale, so the same field shows 03/12 to one clerk and 12/03 to the next with
 * nothing on screen to say which — and between a day in March and a day in
 * December that is not a cosmetic difference. Unlike a misread time, a misread
 * date does not look wrong.
 *
 * Everything else about the native control is worth having, and this has it: the
 * slashes are part of the field rather than something to type, the day is
 * selected when you click the day, and filling one segment moves to the next. So
 * a date is eight digits and nothing else. What it will not do is the one thing
 * that made it unusable here.
 *
 * The field is driven from key presses rather than from its own text, and the
 * rules live in `lib/attendance/dateMask.ts` where they are tested. Letting the
 * text be edited directly is where masked fields come apart — deleting a
 * separator means re-deriving the digits from a string that no longer has a
 * fixed shape, and they shuffle.
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
  const [slots, setSlots] = useState(() => slotsFor(value));
  const [segment, setSegment] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);

  // Follow the stored value when it changes underneath — the form was reset, or
  // the date was set from somewhere else. Not while it is being typed into: the
  // half-finished date on screen is the truth then, and the stored value is
  // empty precisely because it is half finished.
  useEffect(() => {
    if (!focused) setSlots(slotsFor(value));
  }, [value, focused]);

  /**
   * Keep the active segment highlighted.
   *
   * Done after every render rather than in the handlers, because the browser
   * moves the caret on its own — after a click, and after React writes the value
   * — and a selection set before that is gone by the time anybody sees it.
   */
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field || !focused) return;
    const [from, to] = segmentRange(segment);
    if (field.selectionStart !== from || field.selectionEnd !== to) {
      field.setSelectionRange(from, to);
    }
  });

  /** Hand the date up as soon as it is one, and take it back when it is not. */
  const publish = (next: string[]) => {
    const iso = dateFrom(next);
    if (iso !== value) onChange(iso);
  };

  const apply = (result: {
    slots: string[];
    segment: number;
    cursor: number;
  }) => {
    setSlots(result.slots);
    setSegment(result.segment);
    setCursor(result.cursor);
    publish(result.slots);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      apply(typeDigit(slots, segment, cursor, event.key));
      return;
    }

    switch (event.key) {
      case "Backspace":
      case "Delete":
        event.preventDefault();
        apply(deleteBack(slots, segment, cursor));
        return;
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        setSegment(step(segment, event.key === "ArrowLeft" ? -1 : 1));
        setCursor(0);
        return;
      case "ArrowUp":
      case "ArrowDown":
        // Nothing to step through — a date field is not a spinner here.
        event.preventDefault();
        return;
      default:
        // Tab, Enter, Escape and the rest belong to the form, not to this.
        if (event.key.length === 1) event.preventDefault();
    }
  };

  /**
   * Take a pasted date, if it holds one.
   *
   * Its digits are poured into the boxes from the start, so 25/12/2026 and
   * 25-12-2026 and 25122026 all land the same way. Anything that does not fill
   * the field is dropped rather than half-applied — a date field holding four of
   * somebody's eight digits is worse than one that ignored them.
   */
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/[^\d]/g, "");
    if (digits.length !== 8) return;

    const pasted = [...digits];
    setSlots(pasted);
    setSegment(DATE_SEGMENTS.length - 1);
    setCursor(DATE_SEGMENTS[DATE_SEGMENTS.length - 1].length);
    publish(pasted);
  };

  /**
   * The same edits, from a soft keyboard.
   *
   * `keydown` is a physical-keyboard event. Android keyboards compose their
   * input, so a digit arrives as `Unidentified` with keyCode 229 and the handler
   * above never sees it — which made this field accept nothing at all on most
   * phones. `beforeinput` carries the text itself and the intent behind a
   * delete, on every platform, so that is where a tapped key is caught.
   *
   * The two do not collide: `keydown` runs first, and where it acts it prevents
   * the default, so no input event follows. This only ever runs for keys the
   * other one could not read.
   */
  const onBeforeInput = (event: FormEvent<HTMLInputElement>) => {
    const native = event.nativeEvent as InputEvent;
    event.preventDefault();

    if (native.inputType?.startsWith("delete")) {
      apply(deleteBack(slots, segment, cursor));
      return;
    }

    let state = { slots, segment, cursor };
    let took = false;
    for (const character of native.data ?? "") {
      if (!/\d/.test(character)) continue;
      state = typeDigit(state.slots, state.segment, state.cursor, character);
      took = true;
    }
    // Autocorrect and emoji reach here too. Refusing them silently is right; a
    // needless re-render on every one of them is not.
    if (took) apply(state);
  };

  /** Clicking anywhere in a segment takes the whole segment. */
  const onPick = (event: MouseEvent<HTMLInputElement>) => {
    const caret = event.currentTarget.selectionStart ?? 0;
    const picked = segmentAt(caret);
    setSegment(picked);
    setCursor(0);
  };

  // An empty field left alone shows nothing rather than a skeleton nobody has
  // touched — the placeholder says what to type. It fills in the moment it is
  // used, and stays filled while it holds anything at all.
  const showMask = focused || !isBlank(slots);

  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      aria-label={ariaLabel}
      disabled={disabled}
      value={showMask ? render(slots) : ""}
      // Every change comes from a key press or a paste. Anything else that
      // reaches the DOM value — a drag-and-drop, an autofill — is put straight
      // back, so the boxes and what is on screen cannot drift apart.
      onChange={(e) => {
        e.currentTarget.value = showMask ? render(slots) : "";
      }}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      onBeforeInput={onBeforeInput}
      onMouseUp={onPick}
      onFocus={(e) => {
        setFocused(true);
        setSegment(segmentAt(e.currentTarget.selectionStart ?? 0));
        setCursor(0);
      }}
      onBlur={() => setFocused(false)}
      className={cn("tabular-nums", className)}
    />
  );
}
