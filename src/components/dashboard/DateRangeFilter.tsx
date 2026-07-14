import { useState } from "react";
import {
  startOfDay,
  subDays,
  subMonths,
  endOfDay,
  format,
} from "date-fns";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "@/lib/analytics";

export type PresetKey =
  | "today"
  | "yesterday"
  | "7d"
  | "month"
  | "all"
  | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "month", label: "Last Month" },
  { key: "all", label: "All" },
];

export function presetRange(key: PresetKey): DateRange {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday":
      return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "month":
      return { from: startOfDay(subMonths(now, 1)), to: endOfDay(now) };
    case "all":
    default:
      return { from: new Date(2000, 0, 1), to: endOfDay(now) };
  }
}

interface DateRangeFilterProps {
  value: PresetKey;
  onChange: (key: PresetKey, range: DateRange) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [customFrom, setCustomFrom] = useState(
    format(subDays(new Date(), 7), "yyyy-MM-dd"),
  );
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [open, setOpen] = useState(false);

  const applyCustom = () => {
    onChange("custom", {
      from: startOfDay(new Date(customFrom)),
      to: endOfDay(new Date(customTo)),
    });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key, presetRange(p.key))}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
              (value === p.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value === "custom" ? "default" : "outline"}
            size="sm"
            className="h-8"
          >
            <Calendar className="h-3.5 w-3.5" />
            Custom
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          <Button size="sm" className="w-full" onClick={applyCustom}>
            Apply Range
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
