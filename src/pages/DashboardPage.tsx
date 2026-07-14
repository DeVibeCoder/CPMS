import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Boxes,
  Layers,
  Container,
  Factory,
  TrendingUp,
  Warehouse,
  PackageOpen,
  Link2,
  Package,
  FilePlus2,
  FileText,
  Printer,
  Download,
  Search,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart, CHART_COLORS } from "@/components/dashboard/TrendChart";
import {
  DateRangeFilter,
  presetRange,
  type PresetKey,
} from "@/components/dashboard/DateRangeFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { repo } from "@/data";
import { useSettings } from "@/store/settings";
import type { Report } from "@/types";
import { computeTotals } from "@/lib/calculations";
import { buildTrend, filterByRange, deltaPct } from "@/lib/analytics";
import { downloadReportPdf, printReportPdf } from "@/lib/pdf";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [preset, setPreset] = useState<PresetKey>("7d");
  const [range, setRange] = useState(presetRange("7d"));

  usePageMeta("Dashboard", "View today's stock summary and analytics.");

  useEffect(() => {
    repo.listReports().then(setReports);
  }, []);

  const latest = reports?.[0];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todaysReport = reports?.find((r) => r.date === todayStr);
  const kpiReport = todaysReport ?? latest;
  const totals = kpiReport ? computeTotals(kpiReport.data) : null;

  // Full trend (for deltas) and filtered trend (for charts).
  const fullTrend = useMemo(
    () => (reports ? buildTrend(reports) : []),
    [reports],
  );
  const filteredTrend = useMemo(() => {
    if (!reports) return [];
    return buildTrend(filterByRange(reports, range));
  }, [reports, range]);

  const onRange = (key: PresetKey, r: ReturnType<typeof presetRange>) => {
    setPreset(key);
    setRange(r);
  };

  const recent = reports?.slice(0, 10) ?? [];

  if (!reports || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const kpis = totals
    ? [
        {
          title: "50KG Bags",
          value: totals.total50kgBags,
          icon: Boxes,
          accent: "blue" as const,
          delta: deltaPct(fullTrend.map((p) => p.bags50kg)),
        },
        {
          title: "Jumbo Bags",
          value: totals.totalJumboBags,
          icon: Layers,
          accent: "violet" as const,
          delta: deltaPct(fullTrend.map((p) => p.jumbo)),
        },
        {
          title: "Current Silo Balance",
          value: kpiReport!.data.silo.currentStock,
          unit: "MT",
          decimals: 2,
          icon: Container,
          accent: "emerald" as const,
          delta: deltaPct(fullTrend.map((p) => p.currentStock)),
        },
        {
          title: "Today's Production",
          value: kpiReport!.data.silo.production,
          unit: "MT",
          decimals: 2,
          icon: Factory,
          accent: "amber" as const,
          delta: deltaPct(fullTrend.map((p) => p.production)),
        },
        {
          title: "Today's Sales",
          value: kpiReport!.data.silo.sales,
          unit: "MT",
          decimals: 2,
          icon: TrendingUp,
          accent: "blue" as const,
          delta: deltaPct(fullTrend.map((p) => p.sales)),
        },
        {
          title: "Current Stock",
          value: totals.totalCementMt,
          unit: "MT",
          decimals: 2,
          icon: Warehouse,
          accent: "emerald" as const,
          delta: deltaPct(fullTrend.map((p) => p.totalCementMt)),
        },
        {
          title: "Total Empty Bags",
          value: totals.totalEmptyBags,
          icon: Package,
          accent: "slate" as const,
          delta: deltaPct(fullTrend.map((p) => p.emptyBags)),
        },
        {
          title: "Empty Jumbo Bags",
          value: totals.totalEmptyJumbo,
          icon: PackageOpen,
          accent: "violet" as const,
        },
        {
          title: "Net Slings",
          value: totals.totalNetSlings,
          icon: Link2,
          accent: "amber" as const,
        },
      ]
    : [];

  return (
    <div>
      {/* Toolbar: context + date/period filter */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {kpiReport
            ? `Showing figures from ${format(parseISO(kpiReport.date), "EEEE, dd MMM yyyy")}${
                todaysReport ? " (today)" : " (latest report)"
              }`
            : "No reports yet — create your first daily stock report."}
        </p>
        <DateRangeFilter value={preset} onChange={onRange} />
      </div>

      {/* Today's report status banner */}
      <Card className="mb-6 border-l-4 border-l-primary">
        <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                Today's Report
                {todaysReport ? (
                  <Badge variant="success">Submitted</Badge>
                ) : (
                  <Badge variant="warning">Pending</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {todaysReport
                  ? `Recorded by ${todaysReport.createdByName} at ${format(parseISO(todaysReport.createdAt), "HH:mm")}`
                  : "No stock report has been recorded for today yet."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {todaysReport ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/reports/${todaysReport.id}`)}
              >
                <FileText className="h-4 w-4" />
                View Today's Report
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate("/reports/new")}>
                <FilePlus2 className="h-4 w-4" />
                Create Today's Report
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI grid — stacked on mobile, denser on larger screens */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.title} {...k} />
        ))}
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TrendChart
          title="Current Stock Trend"
          data={filteredTrend}
          type="area"
          decimals={0}
          series={[
            {
              key: "currentStock",
              name: "Silo Balance (MT)",
              color: CHART_COLORS.emerald,
            },
          ]}
        />
        <TrendChart
          title="Production vs Sales"
          data={filteredTrend}
          type="area"
          decimals={0}
          series={[
            { key: "production", name: "Production (MT)", color: CHART_COLORS.blue },
            { key: "sales", name: "Sales (MT)", color: CHART_COLORS.amber },
          ]}
        />
        <TrendChart
          title="Cement Stock Trend"
          data={filteredTrend}
          type="area"
          decimals={0}
          series={[
            {
              key: "totalCementMt",
              name: "Total Cement (MT)",
              color: CHART_COLORS.violet,
            },
          ]}
        />
        <TrendChart
          title="50KG Bags Stock Trend"
          data={filteredTrend}
          type="bar"
          decimals={0}
          series={[
            { key: "bags50kg", name: "50KG Bags", color: CHART_COLORS.blue },
          ]}
        />
      </div>

      {/* Recent + Quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Reports</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recent.map((r) => {
                const t = computeTotals(r.data);
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/reports/${r.id}`)}
                    className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {format(parseISO(r.date), "dd MMM yyyy")}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.createdByName}
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-xs text-muted-foreground">
                        Cement
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {formatNumber(t.totalCementMt, { decimals: 0 })} MT
                      </div>
                    </div>
                    <Badge
                      variant={r.status === "final" ? "success" : "secondary"}
                      className="capitalize"
                    >
                      {r.status}
                    </Badge>
                  </button>
                );
              })}
              {recent.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No reports yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2.5">
            <Button className="justify-start" onClick={() => navigate("/reports/new")}>
              <FilePlus2 className="h-4 w-4" />
              Create Report
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={!kpiReport}
              onClick={() => kpiReport && navigate(`/reports/${kpiReport.id}`)}
            >
              <FileText className="h-4 w-4" />
              {todaysReport ? "Today's Report" : "Latest Report"}
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={!kpiReport}
              onClick={() =>
                kpiReport && downloadReportPdf(kpiReport, settings)
              }
            >
              <Download className="h-4 w-4" />
              Generate PDF
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={!kpiReport}
              onClick={() => kpiReport && printReportPdf(kpiReport, settings)}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => navigate("/reports")}
            >
              <Search className="h-4 w-4" />
              Search Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
