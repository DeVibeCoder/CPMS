import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn, formatNumber, parseNumber } from "@/lib/utils";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  allowDecimals?: boolean;
  unit?: string;
  className?: string;
}

/**
 * A numeric input that shows thousands-separated values while idle and a raw
 * editable value while focused. Emits a parsed number on every change.
 */
export function NumberField({
  label,
  value,
  onChange,
  allowDecimals = false,
  unit,
  className,
}: NumberFieldProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const display = focused
    ? raw
    : formatNumber(value, allowDecimals ? {} : { decimals: 0 });

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <input
          inputMode={allowDecimals ? "decimal" : "numeric"}
          value={display}
          onFocus={() => {
            setFocused(true);
            setRaw(value === 0 ? "" : String(value));
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value;
            setRaw(v);
            onChange(parseNumber(v));
          }}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background px-3 text-right text-sm font-medium tabular-nums shadow-sm transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            unit && "pr-10",
          )}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
