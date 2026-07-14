import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/store/theme";
import { formatNumber } from "@/lib/utils";

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

interface TrendChartProps {
  title: string;
  data: Array<Record<string, number | string>>;
  series: SeriesDef[];
  type?: "area" | "line" | "bar";
  height?: number;
  action?: React.ReactNode;
  decimals?: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  decimals,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  decimals?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-elevated">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {formatNumber(p.value, decimals !== undefined ? { decimals } : {})}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  title,
  data,
  series,
  type = "area",
  height = 260,
  action,
  decimals,
}: TrendChartProps) {
  const isDark = useTheme((s) => s.isDark);
  const grid = isDark ? "#1e293b" : "#e5eaf1";
  const axis = isDark ? "#64748b" : "#94a3b8";

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: axis }}
        tickLine={false}
        axisLine={{ stroke: grid }}
        minTickGap={16}
      />
      <YAxis
        tick={{ fontSize: 11, fill: axis }}
        tickLine={false}
        axisLine={false}
        width={48}
        tickFormatter={(v) => formatNumber(Number(v), { decimals: 0 })}
      />
      <Tooltip
        content={<ChartTooltip decimals={decimals} />}
        cursor={{ stroke: axis, strokeOpacity: 0.3 }}
      />
      {series.length > 1 && (
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
      )}
    </>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="pl-1 pr-3">
        {data.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            No data for the selected range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height} debounce={180}>
            {type === "area" ? (
              <AreaChart data={data} margin={{ top: 8, right: 8 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient
                      key={s.key}
                      id={`grad-${s.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                {commonAxes}
                {series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#grad-${s.key})`}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </AreaChart>
            ) : type === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8 }}>
                {commonAxes}
                {series.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={34}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 8 }}>
                {commonAxes}
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Shared chart palette — coherent across the whole app. */
export const CHART_COLORS = {
  blue: "#2563eb",
  emerald: "#059669",
  amber: "#d97706",
  violet: "#7c3aed",
  cyan: "#0891b2",
  rose: "#e11d48",
};
