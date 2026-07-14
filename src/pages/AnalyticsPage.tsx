import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { usePageMeta } from "@/store/pageMeta";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { SwipeCards } from "@/components/mobile/SwipeCards";
import { TrendChart, CHART_COLORS } from "@/components/dashboard/TrendChart";
import {
  DateRangeFilter,
  presetRange,
  type PresetKey,
} from "@/components/dashboard/DateRangeFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { repo } from "@/data";
import type { Report } from "@/types";
import { buildTrend, filterByRange } from "@/lib/analytics";
import { formatNumber } from "@/lib/utils";

function StatMini({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium">{unit}</span>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [preset, setPreset] = useState<PresetKey>("month");
  const [range, setRange] = useState(presetRange("month"));

  usePageMeta("Analytics", "View historical trends and performance.");
  const isMobile = useIsMobile();

  useEffect(() => {
    repo.listReports().then(setReports);
  }, []);

  const trend = useMemo(() => {
    if (!reports) return [];
    return buildTrend(filterByRange(reports, range));
  }, [reports, range]);

  const summary = useMemo(() => {
    if (trend.length === 0) return null;
    const avg = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      avgProduction: avg(trend.map((t) => t.production)),
      avgSales: avg(trend.map((t) => t.sales)),
      totalProduction: trend.reduce((a, t) => a + t.production, 0),
      totalSales: trend.reduce((a, t) => a + t.sales, 0),
      peakStock: Math.max(...trend.map((t) => t.currentStock)),
      latestStock: trend[trend.length - 1].currentStock,
      count: trend.length,
    };
  }, [trend]);

  if (!reports) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Historical trends and comparisons across the plant's stock metrics.
        </p>
        <DateRangeFilter
          value={preset}
          onChange={(k, r) => {
            setPreset(k);
            setRange(r);
          }}
        />
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatMini
            label="Avg. Daily Production"
            value={formatNumber(summary.avgProduction, { decimals: 1 })}
            unit="MT"
          />
          <StatMini
            label="Avg. Daily Sales"
            value={formatNumber(summary.avgSales, { decimals: 1 })}
            unit="MT"
          />
          <StatMini
            label="Peak Silo Balance"
            value={formatNumber(summary.peakStock, { decimals: 0 })}
            unit="MT"
          />
          <StatMini
            label="Reports in Range"
            value={String(summary.count)}
          />
        </div>
      )}

      {(() => {
        const height = isMobile ? 240 : 280;
        const charts = [
          <TrendChart
            key="stock"
            title="Current Stock Trend"
            data={trend}
            type="area"
            decimals={0}
            height={height}
            series={[
              {
                key: "currentStock",
                name: "Silo Balance (MT)",
                color: CHART_COLORS.emerald,
              },
            ]}
          />,
          <TrendChart
            key="prod"
            title="Production Trend"
            data={trend}
            type="area"
            decimals={0}
            height={height}
            series={[
              {
                key: "production",
                name: "Production (MT)",
                color: CHART_COLORS.blue,
              },
            ]}
          />,
          <TrendChart
            key="sales"
            title="Sales Trend"
            data={trend}
            type="area"
            decimals={0}
            height={height}
            series={[
              { key: "sales", name: "Sales (MT)", color: CHART_COLORS.amber },
            ]}
          />,
          <TrendChart
            key="pvs"
            title="Production vs Sales"
            data={trend}
            type="bar"
            decimals={0}
            height={height}
            series={[
              { key: "production", name: "Production", color: CHART_COLORS.blue },
              { key: "sales", name: "Sales", color: CHART_COLORS.amber },
            ]}
          />,
          <TrendChart
            key="50kg"
            title="50KG Bags Trend"
            data={trend}
            type="line"
            decimals={0}
            height={height}
            series={[
              { key: "bags50kg", name: "50KG Bags", color: CHART_COLORS.violet },
            ]}
          />,
          <TrendChart
            key="jumbo"
            title="Jumbo Bags Trend"
            data={trend}
            type="line"
            decimals={0}
            height={height}
            series={[
              { key: "jumbo", name: "Jumbo Bags", color: CHART_COLORS.cyan },
            ]}
          />,
        ];
        return isMobile ? (
          <SwipeCards>{charts}</SwipeCards>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">{charts}</div>
        );
      })()}

      {/* Historical comparison table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Historical Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Silo Balance
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Production
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sales</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    50KG Bags
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Cement (MT)
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...trend].reverse().map((t) => (
                  <tr
                    key={t.date}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {format(parseISO(t.date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(t.currentStock, { decimals: 0 })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(t.production, { decimals: 0 })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(t.sales, { decimals: 0 })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(t.bags50kg)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {formatNumber(t.totalCementMt, { decimals: 0 })}
                    </td>
                  </tr>
                ))}
                {trend.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No data in the selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
