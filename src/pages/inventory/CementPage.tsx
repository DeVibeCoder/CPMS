import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowUpFromLine,
  CalendarClock,
  Container,
  FileText,
  Loader2,
  Plus,
  Ship,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { NumberField } from "@/components/report/NumberField";
import { repo } from "@/data";
import { usePageMeta } from "@/store/pageMeta";
import { useSettings } from "@/store/settings";
import { useAuth, can } from "@/store/auth";
import { buildBinCard, summariseBinCard } from "@/lib/binCard";
import { formatNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Report, Shipment } from "@/types";

/**
 * Cement inventory — a bin card.
 *
 * Two things feed it, and neither is typed into this page twice:
 *
 *     Current Balance = Opening Balance + New Shipment − Production
 *
 * Production comes from finalised reports. New Shipment comes from the
 * shipments ledger, logged here as it arrives. Each day's closing figure becomes
 * the next day's opening figure.
 *
 * The one manual figure — the very first opening balance — is set in Settings,
 * not here. It is entered once at go-live by an administrator, so it does not
 * earn a permanent banner above the data everyone actually comes to read.
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

const ALL_MONTHS = "all";

export default function CementPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  // Logging what arrived is part of running the plant, so dispatch may do it.
  // Removing a record rewrites settled history, so that stays with admin.
  const canLog = can(user?.role, "editReports");
  const canRemove = can(user?.role, "deleteReports");
  const settings = useSettings((s) => s.settings);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  /** null until the user picks — resolved to the newest month at render. */
  const [month, setMonth] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [shipDate, setShipDate] = useState("");
  const [shipAmount, setShipAmount] = useState(0);
  const [shipNote, setShipNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState<Shipment | null>(null);
  const [removing, setRemoving] = useState(false);

  usePageMeta(
    "Cement Inventory",
    "Running stock ledger — balances are carried forward automatically from finalised reports.",
  );

  const load = useCallback(async () => {
    const [loadedReports, loadedShipments] = await Promise.all([
      repo.listReports().catch(() => [] as Report[]),
      // A database that predates the shipments table should still show its
      // ledger from the report figures rather than failing to render at all.
      repo.listShipments().catch((e: unknown) => {
        toast({
          variant: "destructive",
          title: "Shipments could not be loaded",
          description: e instanceof Error ? e.message : undefined,
        });
        return [] as Shipment[];
      }),
    ]);
    setReports(loadedReports);
    setShipments(loadedShipments);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openingBalance = settings?.cementOpeningBalance ?? 0;
  const openingDate =
    settings?.cementOpeningDate ?? format(new Date(), "yyyy-MM-01");
  const configured = settings?.cementOpeningDate !== undefined;

  const rows = useMemo(
    () =>
      reports
        ? buildBinCard({ reports, shipments, openingBalance, openingDate })
        : [],
    [reports, shipments, openingBalance, openingDate],
  );

  // The summary is deliberately whole-ledger, not month-filtered: "Current
  // Balance" means the cement in the silos, which does not change because
  // somebody is looking at March.
  const summary = useMemo(
    () => summariseBinCard(rows, openingBalance, openingDate),
    [rows, openingBalance, openingDate],
  );

  /** Months that actually have rows, newest first. */
  const months = useMemo(() => {
    const set = new Set(rows.map((r) => r.date.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  /**
   * Default to the newest month rather than to everything: the ledger grows by a
   * row a day, and the figure anyone opening this page wants is the current one.
   * A month the user picked that has since emptied falls back the same way.
   */
  const activeMonth =
    month && (month === ALL_MONTHS || months.includes(month))
      ? month
      : (months[0] ?? ALL_MONTHS);

  /**
   * Newest date first, to match Report History.
   *
   * Only the display order is reversed. The ledger itself has to be built
   * oldest-first, because every row's opening balance is the previous row's
   * closing balance — so the calculation and the presentation deliberately run
   * in opposite directions.
   */
  const displayRows = useMemo(() => {
    const visible =
      activeMonth === ALL_MONTHS
        ? rows
        : rows.filter((r) => r.date.startsWith(activeMonth));
    return [...visible].reverse();
  }, [rows, activeMonth]);

  /** Reports that are still drafts — their production is not on the card yet. */
  const pendingDrafts = useMemo(
    () =>
      (reports ?? []).filter(
        (r) => r.status === "draft" && r.date >= openingDate,
      ).length,
    [reports, openingDate],
  );

  /** The shipment already recorded for the date being edited, if any. */
  const existingShipment = useMemo(
    () => shipments.find((s) => s.date === shipDate) ?? null,
    [shipments, shipDate],
  );

  const openShipmentDialog = (date?: string) => {
    const target = date ?? format(new Date(), "yyyy-MM-dd");
    const existing = shipments.find((s) => s.date === target);
    setShipDate(target);
    setShipAmount(existing?.amountMt ?? 0);
    setShipNote(existing?.note ?? "");
    setDialogOpen(true);
  };

  const saveShipment = async () => {
    if (!user) return;
    if (!shipDate) {
      toast({ variant: "destructive", title: "Choose a date." });
      return;
    }
    if (shipAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Enter how much cement arrived.",
        description: "A shipment has to be more than zero MT.",
      });
      return;
    }
    setSaving(true);
    try {
      await repo.saveShipment({
        date: shipDate,
        amountMt: shipAmount,
        note: shipNote.trim() || undefined,
        createdBy: user.id,
        createdByName: user.name,
      });
      toast({
        variant: "success",
        title: existingShipment ? "Shipment updated" : "Shipment logged",
        description: `${formatNumber(shipAmount, { decimals: 2 })} MT on ${format(parseISO(shipDate), "dd MMM yyyy")}. Balances have been carried forward.`,
      });
      setDialogOpen(false);
      // Show the month the shipment landed in, so it is not saved into a view
      // the user cannot see.
      setMonth(shipDate.slice(0, 7));
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save the shipment",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const removeShipment = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await repo.deleteShipment(toRemove.id);
      toast({
        variant: "success",
        title: "Shipment removed",
        description: "Later balances have been recalculated.",
      });
      setToRemove(null);
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not remove the shipment",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRemoving(false);
    }
  };

  if (!reports) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const monthLabel = (m: string) => format(parseISO(`${m}-01`), "MMMM yyyy");

  /** The New Shipment cell — a button wherever the figure can be edited. */
  const ShipmentCell = ({
    value,
    date,
    legacy,
  }: {
    value: number;
    date: string;
    legacy: boolean;
  }) => {
    const text =
      value === 0 ? "—" : `+${formatNumber(value, { decimals: 2 })}`;
    if (!canLog) {
      return <span className="tabular-nums text-success">{text}</span>;
    }
    return (
      <button
        onClick={() => openShipmentDialog(date)}
        title={
          legacy
            ? "Entered on the report itself. Click to record it as a shipment instead."
            : value === 0
              ? "Log a shipment on this date"
              : "Edit this shipment"
        }
        className={
          "rounded px-1.5 py-0.5 tabular-nums transition-colors hover:bg-success/10 " +
          (value === 0
            ? "text-muted-foreground hover:text-success"
            : "text-success")
        }
      >
        {text}
        {legacy && <span className="ml-1 text-[10px] opacity-60">(report)</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
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

      {/* Bin card. No title block above it — the page header already says what
          this is, and a second heading only pushed the rows down the screen. */}
      <Card>
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Select
              value={activeMonth}
              onValueChange={setMonth}
              disabled={months.length === 0}
            >
              <SelectTrigger className="h-9 w-[11rem]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MONTHS}>All months</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {pendingDrafts > 0 && (
              <Badge variant="warning">
                {pendingDrafts} draft{pendingDrafts === 1 ? "" : "s"} not counted
              </Badge>
            )}

            {canLog && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => openShipmentDialog()}
              >
                <Plus className="h-4 w-4" />
                Add Shipment
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Container className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium">No entries yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {!configured
                  ? "Set the cement opening balance in Settings, then rows appear here as reports are finalised and shipments are logged."
                  : pendingDrafts > 0
                    ? `There ${pendingDrafts === 1 ? "is" : "are"} ${pendingDrafts} draft report${pendingDrafts === 1 ? "" : "s"} on or after ${format(parseISO(openingDate), "dd MMM yyyy")}. Mark a report final — or log a shipment — and its row appears here automatically.`
                    : `Rows appear here as soon as a report dated on or after ${format(parseISO(openingDate), "dd MMM yyyy")} is marked final, or a shipment is logged.`}
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
                        <TableCell className="text-right">
                          <ShipmentCell
                            value={r.newShipment}
                            date={r.date}
                            legacy={r.legacyShipment}
                          />
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
                    {displayRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-16 text-center text-sm text-muted-foreground"
                        >
                          Nothing recorded in {monthLabel(activeMonth)}.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="space-y-3 p-3 md:hidden">
                {displayRows.map((r) => (
                  <div
                    key={r.date}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <button
                      className="flex w-full items-center justify-between text-left"
                      onClick={() =>
                        r.reportId && navigate(`/reports/${r.reportId}`)
                      }
                    >
                      <span className="text-base font-semibold">
                        {format(parseISO(r.date), "dd MMM yyyy")}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {formatNumber(r.currentBalance, { decimals: 2 })}
                        <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                          MT
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Opening</div>
                        <div className="font-medium tabular-nums">
                          {formatNumber(r.openingBalance, { decimals: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Shipment</div>
                        <div className="font-medium">
                          <ShipmentCell
                            value={r.newShipment}
                            date={r.date}
                            legacy={r.legacyShipment}
                          />
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
                  </div>
                ))}
                {displayRows.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    Nothing recorded in {monthLabel(activeMonth)}.
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Current Balance = Opening Balance + New Shipment − Production. Each day's
        Current Balance becomes the next day's Opening Balance. Shipments count
        as soon as they are logged; production counts once its report is marked
        final — a draft has no settled figures to carry forward.
      </p>

      {/* Add / edit shipment */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {existingShipment ? "Edit shipment" : "Add shipment"}
            </DialogTitle>
            <DialogDescription>
              Cement received into the silos. It appears on the bin card as New
              Shipment straight away and is carried into every later balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shipment-date">Date Received</Label>
              <Input
                id="shipment-date"
                type="date"
                value={shipDate}
                onChange={(e) => {
                  const next = e.target.value;
                  const match = shipments.find((s) => s.date === next);
                  setShipDate(next);
                  // Follow the date: switching to a day that already has a
                  // shipment should show that amount, not the one just typed.
                  setShipAmount(match?.amountMt ?? 0);
                  setShipNote(match?.note ?? "");
                }}
              />
            </div>
            <NumberField
              label="Amount Received (MT)"
              value={shipAmount}
              allowDecimals
              unit="MT"
              onChange={setShipAmount}
            />
            <div className="space-y-1.5">
              <Label htmlFor="shipment-note">Reference (optional)</Label>
              <Input
                id="shipment-note"
                placeholder="Vessel or truck reference"
                value={shipNote}
                onChange={(e) => setShipNote(e.target.value)}
              />
            </div>

            {shipDate && shipDate < openingDate && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                This date is before the opening balance date (
                {format(parseISO(openingDate), "dd MMM yyyy")}), so it will not
                appear on the bin card.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {existingShipment
                ? `A shipment of ${formatNumber(existingShipment.amountMt, { decimals: 2 })} MT is already recorded for this date. Saving replaces it.`
                : "One shipment is recorded per date. If more than one delivery arrives, enter the day's total."}
            </p>
          </div>
          <DialogFooter className="sm:justify-between">
            {existingShipment && canRemove ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  // Close this one first — stacking two modals fights over the
                  // focus trap and leaves the confirm unreachable by keyboard.
                  setDialogOpen(false);
                  setToRemove(existingShipment);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveShipment} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {existingShipment ? "Update Shipment" : "Add Shipment"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toRemove)}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove shipment?"
        description={
          toRemove
            ? `The ${formatNumber(toRemove.amountMt, { decimals: 2 })} MT recorded on ${format(parseISO(toRemove.date), "dd MMM yyyy")} will be deleted and every balance after it recalculated. This cannot be undone.`
            : ""
        }
        destructive
        confirmLabel="Remove"
        loading={removing}
        onConfirm={removeShipment}
      />
    </div>
  );
}
