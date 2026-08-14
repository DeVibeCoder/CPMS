import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { breakTotal, formatDuration } from "@/lib/attendance/calculations";
import type { TimeBreak, TimesheetEntry } from "@/types/attendance";
import { TimeField } from "./TimeField";

/**
 * The gaps in somebody's day.
 *
 * A single "break: 60 min" box could not describe the day this exists for: when
 * production stops for rain the crew is released and called back when it
 * clears, so a day can have the ordinary lunch break *and* a two-hour stand-down
 * in the afternoon. Each gap is two clock times and a reason, so the sheet says
 * what happened rather than just how much time went missing.
 *
 * The cell itself stays narrow — a total and a count — and opens to the full
 * list, because most days have one ordinary break and do not deserve a column
 * wide enough for three.
 */
export function BreaksField({
  entry,
  disabled,
  onChange,
}: {
  entry: TimesheetEntry | undefined;
  disabled?: boolean;
  onChange: (breaks: TimeBreak[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const breaks = entry?.breaks ?? [];
  const total = breakTotal(entry);

  const set = (index: number, patch: Partial<TimeBreak>) =>
    onChange(breaks.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const add = () =>
    onChange([...breaks, { from: "", to: "", reason: "" }]);

  const remove = (index: number) =>
    onChange(breaks.filter((_, i) => i !== index));

  // More than one gap is the exceptional day, so it is the one the closed cell
  // calls out.
  const extra = breaks.length > 1;

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal tabular-nums",
            extra && "border-warning/50 text-warning",
          )}
        >
          <span>{total > 0 ? formatDuration(total) : "—"}</span>
          {extra && (
            <span className="ml-1 text-[10px] font-semibold">
              ×{breaks.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[340px] p-3">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Breaks and stand-downs</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(total)}
            </span>
          </div>

          {breaks.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              No gaps recorded. Add one for the ordinary break, and another if
              the crew was released and called back.
            </p>
          )}

          {breaks.map((gap, i) => (
            <div key={i} className="flex items-end gap-1.5">
              <TimeField
                label={i === 0 ? "From" : undefined}
                aria-label="Break from"
                className="w-[62px]"
                value={gap.from}
                onChange={(v) => set(i, { from: v ?? "" })}
              />
              <TimeField
                label={i === 0 ? "To" : undefined}
                aria-label="Break to"
                className="w-[62px]"
                value={gap.to}
                onChange={(v) => set(i, { to: v ?? "" })}
              />
              <div className="flex-1">
                {i === 0 && (
                  <div className="mb-0.5 text-[10px] uppercase text-muted-foreground">
                    Reason
                  </div>
                )}
                <Input
                  className="h-8 uppercase"
                  placeholder="LUNCH / RAIN"
                  aria-label="Break reason"
                  value={gap.reason ?? ""}
                  onChange={(e) =>
                    set(i, { reason: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove break"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={add}
          >
            <Plus className="h-3.5 w-3.5" />
            Add break
          </Button>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Every gap is taken off the day's hours. A release for weather is just
            another gap — give it a reason so the sheet explains itself later.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
