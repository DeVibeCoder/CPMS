import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: LucideIcon;
  decimals?: number;
  delta?: number | null;
  /** For deltas, whether a positive change is "good" (green). */
  positiveIsGood?: boolean;
  accent?: "blue" | "emerald" | "amber" | "violet" | "slate";
}

const ACCENTS: Record<string, string> = {
  blue: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
};

export function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  decimals,
  delta,
  positiveIsGood = true,
  accent = "blue",
}: StatCardProps) {
  const showDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = (delta ?? 0) >= 0;
  const good = up === positiveIsGood;

  return (
    <Card className="p-5 transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight tabular-nums">
              {typeof value === "number"
                ? formatNumber(value, decimals !== undefined ? { decimals } : {})
                : value}
            </span>
            {unit && (
              <span className="text-xs font-medium text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            ACCENTS[accent],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {showDelta && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              good
                ? "bg-success/12 text-success"
                : "bg-destructive/12 text-destructive",
            )}
          >
            {up ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta as number).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs previous report</span>
        </div>
      )}
    </Card>
  );
}
