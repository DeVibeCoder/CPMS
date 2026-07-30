import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  Container,
  FileText,
  Loader2,
  Pencil,
  Ship,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NumberField } from "@/components/report/NumberField";
import { repo } from "@/data";
import { usePageMeta } from "@/store/pageMeta";
import { useSettings } from "@/store/settings";
import { useAuth, can } from "@/store/auth";
import { buildBinCard, summariseBinCard } from "@/lib/binCard";
import { formatNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Report } from "@/types";

/**
 * Cement inventory — a bin card.
 *
 * Nothing on this page is typed in except the very first opening balance. Each
 * row is derived from a finalised report:
 *
 *     Current Balance = Opening Balance + New Shipment − Production
 *
 * and each day's closing figure becomes the next day's opening figure. Finalise
 * a report and its row appears here on its own.
 */

/** One summary tile. */
function Tile({
  label,
  value,
  unit,
  icon: Icon,
  accent = "blue",
}: {
  label: string;
  value: string;
  unit?: string;
  icon: typeof Container;
  accent?: "blue" | "emerald" | "amber" | "violet";
}) {
  const accents: Record<string, string> = {
    blue: "bg-blue-500/[12%] text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/[12%] text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/[12%] text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/[12%] text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
            {label}
          </p>
          <div className="mt-1.5 flex items-baseline gap-1 sm:mt-2 sm:gap-1.5">
            <span className="text-lg font-bold tracking-tight tabular-nums sm:text-2xl">
              {value}
            </span>
            {unit && (
              <span className="text-[10px] font-medium text-muted-foreground sm:text-xs">
                {unit}
              </span>
            )}
          </div>
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${accents[accent]}`}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function CementPage() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.user?.role);
  const isAdmin = can(role, "settings");
  const settings = useSettings((s) => s.settings);
  const saveSettings = useSettings((s) => s.save);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorBalance, setAnchorBalance] = useState(0);
  const [anchorDate, setAnchorDate] = useState("");
  const [saving, setSaving] = useState(false);

  usePageMeta(
    "Cement Inventory",
    "Running stock ledger — balances are carried forward automatically from finalised reports.",
  );

  useEffect(() => {
    repo
      .listReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, []);

  const openingBalance = settings?.cementOpeningBalance ?? 0;
  const openingDate =
    settings?.cementOpeningDate ?? format(new Date(), "yyyy-MM-01");
  const configured = settings?.cementOpeningDate !== undefined;

  const rows = useMemo(
    () =>
      reports
        ? buildBinCard({ reports, openingBalance, openingDate })
        : [],
    [reports, openingBalance, openingDate],
  );

  const summary = useMemo(
    () => summariseBinCard(rows, openingBalance, openingDate),
    [rows, openingBalance, openingDate],
  );

  /**
   * Newest date first, to match Report History.
   *
   * Only the display order is reversed. The ledger itself has to be built
   * oldest-first, because every row's opening balance is the previous row's
   * closing balance — so the calculation and the presentation deliberately run
   * in opposite directions.
   */
  const displayRows = useMemo(() => [...rows].reverse(), [rows]);

  /** Reports that are still drafts — their figures are not on the card yet. */
  const pendingDrafts = useMemo(
    () =>
      (reports ?? []).filter(
        (r) => r.status === "draft" && r.date >= openingDate,
      ).length,
    [reports, openingDate],
  );

  const openAnchor = () => {
    setAnchorBalance(openingBalance);
    setAnchorDate(settings?.cementOpeningDate ?? format(new Date(), "yyyy-MM-01"));
    setAnchorOpen(true);
  };

  const saveAnchor = async () => {
    if (!anchorDate) {
      toast({ variant: "destructive", title: "Choose a start date." });
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        cementOpeningBalance: anchorBalance,
        cementOpeningDate: anchorDate,
      });
      toast({
        variant: "success",
        title: "Opening balance saved",
        description: "The bin card has been recalculated.",
      });
      setAnchorOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save the opening balance",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!reports) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary — 2×2 on a phone rather than four full-width cards, which
          would push the bin card itself below the fold. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile
          label="Current Balance"
          value={formatNumber(summary.currentBalance, { decimals: 2 })}
          unit="MT"
          icon={Container}
          accent="emerald"
        />
        <Tile
          label="Total Shipments Received"
          value={formatNumber(summary.totalShipments, { decimals: 2 })}
          unit="MT"
          icon={Ship}
          accent="blue"
        />
        <Tile
          label="Total Production"
          value={formatNumber(summary.totalProduction, { decimals: 2 })}
          unit="MT"
          icon={ArrowUpFromLine}
          accent="amber"
        />
        <Tile
          label="Balance As At"
          value={
            summary.rowCount === 0
              ? "—"
              : format(parseISO(summary.asAt), "dd MMM yyyy")
          }
          icon={CalendarClock}
          accent="violet"
        />
      </div>

      {/* Anchor / setup — administrators only.
          Everyone else has no action to take here, and showing a control they
          cannot use (or a balance they cannot change) is just noise on a page
          they come to in order to read the ledger. */}
      {isAdmin && (
        <Card className={configured ? undefined : "border-l-4 border-l-primary"}>
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArrowDownToLine className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {configured
                  ? `Opening balance ${formatNumber(openingBalance, { decimals: 2 })} MT as at ${format(parseISO(openingDate), "dd MMM yyyy")}`
                  : "Set the starting opening balance"}
              </p>
              <p className="text-xs text-muted-foreground">
                {configured
                  ? "Entered once by hand. Every balance after this date is carried forward automatically from finalised reports."
                  : "Enter the cement in the silos on your first day. From then on the card maintains itself."}
              </p>
            </div>
            <Button
              variant={configured ? "outline" : "default"}
              size="sm"
              className="w-full sm:w-auto"
              onClick={openAnchor}
            >
              <Pencil className="h-4 w-4" />
              {configured ? "Edit" : "Set Opening Balance"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bin card */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Cement Bin Card</CardTitle>
          {pendingDrafts > 0 && (
            <Badge variant="warning">
              {pendingDrafts} draft{pendingDrafts === 1 ? "" : "s"} not counted
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Container className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium">No entries yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {pendingDrafts > 0
                  ? `There ${pendingDrafts === 1 ? "is" : "are"} ${pendingDrafts} draft report${pendingDrafts === 1 ? "" : "s"} on or after ${format(parseISO(openingDate), "dd MMM yyyy")}. Mark a report final and its row appears here automatically.`
                  : `Rows appear here as soon as a report dated on or after ${format(parseISO(openingDate), "dd MMM yyyy")} is marked final.`}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">
                        Opening Balance
                      </TableHead>
                      <TableHead className="text-right">New Shipment</TableHead>
                      <TableHead className="text-right">Production</TableHead>
                      <TableHead className="text-right">
                        Current Balance
                      </TableHead>
                      <TableHead className="text-right">Report</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map((r) => (
                      <TableRow key={r.date}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {format(parseISO(r.date), "dd MMM yyyy")}
                            {r.isAnchor && (
                              <Badge variant="secondary" className="text-[10px]">
                                opening
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {format(parseISO(r.date), "EEEE")}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(r.openingBalance, { decimals: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {r.newShipment === 0
                            ? "—"
                            : `+${formatNumber(r.newShipment, { decimals: 2 })}`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {r.production === 0
                            ? "—"
                            : `−${formatNumber(r.production, { decimals: 2 })}`}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">
                          {formatNumber(r.currentBalance, { decimals: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.reportId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View report"
                              onClick={() => navigate(`/reports/${r.reportId}`)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="space-y-3 p-3 md:hidden">
                {displayRows.map((r) => (
                  <button
                    key={r.date}
                    onClick={() =>
                      r.reportId && navigate(`/reports/${r.reportId}`)
                    }
                    className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold">
                        {format(parseISO(r.date), "dd MMM yyyy")}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {formatNumber(r.currentBalance, { decimals: 2 })}
                        <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                          MT
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Opening</div>
                        <div className="font-medium tabular-nums">
                          {formatNumber(r.openingBalance, { decimals: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Shipment</div>
                        <div className="font-medium tabular-nums text-success">
                          {r.newShipment === 0
                            ? "—"
                            : `+${formatNumber(r.newShipment, { decimals: 2 })}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Production</div>
                        <div className="font-medium tabular-nums text-destructive">
                          {r.production === 0
                            ? "—"
                            : `−${formatNumber(r.production, { decimals: 2 })}`}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Current Balance = Opening Balance + New Shipment − Production. Each day's
        Current Balance becomes the next day's Opening Balance. Only finalised
        reports are included — a draft has no settled figures to carry forward.
      </p>

      {/* Opening balance dialog */}
      <Dialog open={anchorOpen} onOpenChange={setAnchorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Opening balance</DialogTitle>
            <DialogDescription>
              The cement in the silos on your first day. This is the only figure
              entered by hand — everything after it is calculated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="anchor-date">Start Date</Label>
              <Input
                id="anchor-date"
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
            </div>
            <NumberField
              label="Opening Balance (MT)"
              value={anchorBalance}
              allowDecimals
              unit="MT"
              onChange={setAnchorBalance}
            />
            <p className="text-xs text-muted-foreground">
              Reports dated before the start date are left out of the card.
              Changing either figure recalculates every row.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnchorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAnchor} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
