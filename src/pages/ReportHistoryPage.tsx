import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  FileDown,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { repo } from "@/data";
import { useAuth, can } from "@/store/auth";
import { useReportFilters } from "@/store/reportFilters";
import type { Report } from "@/types";
import { cn } from "@/lib/utils";
import { downloadReportPdf, printReportPdf } from "@/lib/pdf";
import { isLocked } from "@/lib/reportStatus";
import {
  downloadText,
  parseReportsCsv,
  reportsToCsv,
  templateCsv,
  type ParsedRow,
} from "@/lib/reportCsv";
import { formatNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type SortKey = "date" | "createdByName" | "createdAt" | "updatedAt";
const PAGE_SIZE = 10;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Outcome of a bulk import, shown in the results dialog. */
interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** Shipment records written from the "Silo New Shipment MT" column. */
  shipments: number;
  errors: string[];
  /** Set when the date order had to be inferred, e.g. after Excel rewrote it. */
  dateFormat?: string;
}

export default function ReportHistoryPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const canCreate = can(user?.role, "createReports");
  const canEdit = can(user?.role, "editReports");
  const canExport = can(user?.role, "exportPdf");
  const canDelete = can(user?.role, "deleteReports");
  // Bulk import rewrites history in one action, so it is admin-only.
  const canBulk = can(user?.role, "backup");
  // Reverting unlocks a signed-off record, so it is an administrator override —
  // dispatch can finalise a report but cannot undo one.
  const canRevert = can(user?.role, "settings");

  const [reports, setReports] = useState<Report[] | null>(null);
  const [query, setQuery] = useState("");
  // The month/year selection lives in a store rather than in this component, so
  // it survives navigating away to view or edit a report and back again.
  const month = useReportFilters((s) => s.month);
  const year = useReportFilters((s) => s.year);
  const setMonth = useReportFilters((s) => s.setMonth);
  const setYear = useReportFilters((s) => s.setYear);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toRevert, setToRevert] = useState<Report | null>(null);
  const [reverting, setReverting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importCsvRef = useRef<HTMLInputElement>(null);

  usePageMeta("Report History", "Manage all daily cement stock reports.");
  const activeFilters = (month !== "all" ? 1 : 0) + (year !== "all" ? 1 : 0);

  const load = () => repo.listReports().then(setReports);
  useEffect(() => {
    load();
  }, []);

  const years = useMemo(() => {
    const set = new Set<string>();
    reports?.forEach((r) => set.add(r.date.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    const q = query.toLowerCase().trim();
    let rows = reports.filter((r) => {
      const d = parseISO(r.date);
      if (month !== "all" && d.getMonth() !== Number(month)) return false;
      if (year !== "all" && r.date.slice(0, 4) !== year) return false;
      if (q) {
        return (
          r.date.includes(q) ||
          format(d, "MMMM yyyy").toLowerCase().includes(q) ||
          format(d, "dd MMM yyyy").toLowerCase().includes(q) ||
          r.createdByName.toLowerCase().includes(q) ||
          r.status.includes(q)
        );
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [reports, query, month, year, sortKey, sortDir]);

  /**
   * A single month is at most 31 rows, so it is shown whole inside a fixed,
   * scrollable area — paging through a month a third at a time made comparing
   * days needlessly awkward. "All Months" can be years of history, so that view
   * keeps its pager.
   */
  const monthView = month !== "all";
  const totalPages = monthView
    ? 1
    : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = monthView
    ? filtered
    : filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const resetPage = () => setPage(1);

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await repo.deleteReport(toDelete.id);
      toast({ variant: "success", title: "Report deleted" });
      setToDelete(null);
      await load();
    } catch {
      toast({ variant: "destructive", title: "Could not delete report" });
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Send a finalised report back to draft.
   *
   * The only way to change a final report — it becomes editable again, and drops
   * off the cement bin card until it is finalised a second time. Deliberately an
   * explicit action rather than an implicit unlock on the edit screen.
   */
  const doRevert = async () => {
    if (!toRevert || !user) return;
    setReverting(true);
    try {
      await repo.updateReport(toRevert.id, {
        status: "draft",
        updatedByName: user.name,
      });
      toast({
        variant: "success",
        title: "Reverted to draft",
        description:
          "The report is editable again and is no longer counted on the cement bin card.",
      });
      setToRevert(null);
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not revert the report",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setReverting(false);
    }
  };

  const onDownloadTemplate = () => {
    downloadText("cpsm-report-template.csv", templateCsv());
    toast({
      variant: "success",
      title: "Template downloaded",
      description:
        "Fill one row per report date, then use Import. Extra columns are ignored.",
    });
  };

  const onExportCsv = () => {
    if (!reports || reports.length === 0) {
      toast({ variant: "destructive", title: "There is nothing to export yet." });
      return;
    }
    downloadText(
      `cpsm-reports-${format(new Date(), "yyyy-MM-dd")}.csv`,
      reportsToCsv(reports),
    );
    toast({
      variant: "success",
      title: `Exported ${reports.length} report${reports.length === 1 ? "" : "s"}`,
    });
  };

  /**
   * Import a filled template.
   *
   * Rows are matched to existing reports by date and updated in place rather
   * than duplicated, so re-importing a corrected file fixes the same days
   * instead of creating a second report for each. Every row is attempted even
   * if some fail — a clerk loading years of history needs the full error list.
   *
   * A non-zero "Silo New Shipment MT" also writes a shipment record for that
   * date, because the bin card reads shipments from their own ledger now. It is
   * an upsert keyed on date, so re-importing the same month corrects the
   * shipments rather than adding to them.
   */
  const onImportCsv = async (file?: File) => {
    if (!file || !user) return;
    setImporting(true);
    try {
      const text = await file.text();
      const { rows, errors, dateFormat } = parseReportsCsv(text);

      if (rows.length === 0) {
        setImportResult({
          created: 0,
          updated: 0,
          skipped: 0,
          shipments: 0,
          errors,
          dateFormat,
        });
        return;
      }

      const existing = new Map(
        (await repo.listReports()).map((r) => [r.date, r]),
      );

      let created = 0;
      let updated = 0;
      let shipments = 0;
      const failures = [...errors];

      for (const row of rows as ParsedRow[]) {
        try {
          const match = existing.get(row.date);
          if (match) {
            await repo.updateReport(match.id, {
              status: row.status,
              data: row.data,
              updatedByName: user.name,
            });
            updated++;
          } else {
            await repo.createReport({
              date: row.date,
              status: row.status,
              data: row.data,
              createdBy: user.id,
              createdByName: user.name,
              updatedByName: user.name,
            });
            created++;
          }
        } catch (e) {
          failures.push(
            `${row.date}: ${e instanceof Error ? e.message : "could not be saved"}`,
          );
          // The shipment belongs to a report that did not save — skip it rather
          // than leaving a shipment with no report behind it.
          continue;
        }

        const amountMt = row.data.silo.newShipment ?? 0;
        if (amountMt <= 0) continue;
        try {
          await repo.saveShipment({
            date: row.date,
            amountMt,
            note: "Imported",
            createdBy: user.id,
            createdByName: user.name,
          });
          shipments++;
        } catch (e) {
          // The report itself landed, so this is reported as its own problem
          // rather than counting the whole row as failed.
          failures.push(
            `${row.date}: the report imported but its shipment did not — ${e instanceof Error ? e.message : "could not be saved"}`,
          );
        }
      }

      setImportResult({
        created,
        updated,
        skipped: failures.length,
        shipments,
        errors: failures,
        dateFormat,
      });
      await load();
    } catch (e) {
      setImportResult({
        created: 0,
        updated: 0,
        skipped: 0,
        shipments: 0,
        errors: [
          e instanceof Error ? e.message : "The file could not be read.",
        ],
      });
    } finally {
      setImporting(false);
      // Allow re-picking the same file after a correction.
      if (importCsvRef.current) importCsvRef.current.value = "";
    }
  };

  const doDuplicate = async (r: Report) => {
    if (!user) return;
    const newDate = format(new Date(), "yyyy-MM-dd");
    const existing = await repo.getReportByDate(newDate);
    const target = existing ? r.date : newDate;
    try {
      const copy = await repo.duplicateReport(r.id, target, user);
      toast({
        variant: "success",
        title: "Report duplicated",
        description: "Opening the copy for editing.",
      });
      navigate(`/reports/${copy.id}/edit`);
    } catch {
      toast({ variant: "destructive", title: "Could not duplicate report" });
    }
  };

  /**
   * One compact icon per permitted action, laid out in a single row.
   *
   * Everything a role may do is visible at a glance — there is no overflow menu,
   * so an action is either an icon or it is not offered at all. The icon is the
   * whole control, so each carries a tooltip and an accessible name.
   */
  const RowActions = ({ r }: { r: Report }) => {
    const actions: Array<{
      key: string;
      label: string;
      icon: typeof Eye;
      onClick: () => void;
      destructive?: boolean;
    }> = [
      {
        key: "view",
        label: "View",
        icon: Eye,
        onClick: () => navigate(`/reports/${r.id}`),
      },
    ];

    // A draft is editable by anyone who may edit. A final report can only be
    // reopened by an administrator, so dispatch simply sees neither action.
    if (canEdit && !isLocked(r)) {
      actions.push({
        key: "edit",
        label: "Edit",
        icon: Pencil,
        onClick: () => navigate(`/reports/${r.id}/edit`),
      });
    }
    if (canRevert && isLocked(r)) {
      actions.push({
        key: "revert",
        label: "Revert to draft",
        icon: Undo2,
        onClick: () => setToRevert(r),
      });
    }
    if (canExport) {
      actions.push(
        {
          key: "print",
          label: "Print",
          icon: Printer,
          onClick: () => printReportPdf(r),
        },
        {
          key: "pdf",
          label: "Download PDF",
          icon: Download,
          onClick: () => downloadReportPdf(r),
        },
      );
    }
    if (canCreate) {
      actions.push({
        key: "duplicate",
        label: "Duplicate",
        icon: Copy,
        onClick: () => doDuplicate(r),
      });
    }
    if (canDelete) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: Trash2,
        onClick: () => setToDelete(r),
        destructive: true,
      });
    }

    return (
      <div className="flex items-center justify-end gap-0.5">
        {actions.map((a) => (
          <Tooltip key={a.key} delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={a.label}
                className={cn(
                  // Compact on the desktop table, comfortably tappable on the
                  // mobile card where the same row is reused.
                  "h-9 w-9 shrink-0 md:h-7 md:w-7",
                  a.destructive &&
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
                onClick={a.onClick}
              >
                <a.icon className="h-4 w-4 md:h-[15px] md:w-[15px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{a.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  };

  const SortHead = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  return (
    <div>
      <Card>
        <CardContent className="p-0">
          {/* Toolbar: search + compact filters + create */}
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-[16rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reports…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                className="h-9 pl-9"
              />
            </div>
            {/* Desktop filters */}
            <div className="hidden gap-2 md:flex">
              <Select
                value={month}
                onValueChange={(v) => {
                  setMonth(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-[9.5rem]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={year}
                onValueChange={(v) => {
                  setYear(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-9 w-[7.5rem]">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mobile filters button */}
            <Button
              variant="outline"
              className="shrink-0 md:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {/* Admins find the bulk import/export inside this sheet too, so
                  the label says so rather than hiding them behind "Filters". */}
              {canBulk ? "Filters & Tools" : "Filters"}
              {activeFilters > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>

            {/* Bulk tools — admin only. Grouped to the right so they read as
                maintenance actions rather than part of the daily workflow. */}
            {canBulk && (
              <div className="hidden shrink-0 gap-2 md:ml-auto md:flex">
                <Button variant="outline" size="sm" onClick={onDownloadTemplate}>
                  <FileDown className="h-4 w-4" />
                  Template
                </Button>
                <input
                  ref={importCsvRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onImportCsv(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importing}
                  onClick={() => importCsvRef.current?.click()}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Import
                </Button>
                <Button variant="outline" size="sm" onClick={onExportCsv}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            )}

            {canCreate && (
              <Button
                className={cn(
                  "hidden shrink-0 md:inline-flex",
                  !canBulk && "sm:ml-auto",
                )}
                onClick={() => navigate("/reports/new")}
              >
                <FilePlus2 className="h-4 w-4" />
                Create New Report
              </Button>
            )}
          </div>

          {!reports ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop / tablet table. In month view the body scrolls inside
                  a fixed area with the header pinned, so the toolbar and the
                  page around it never move as months are switched. */}
              <div className="hidden md:block">
                <Table
                  containerClassName={cn(
                    monthView && "max-h-[calc(100vh-19rem)] min-h-[20rem]",
                  )}
                >
                  <TableHeader
                    className={cn(
                      monthView && "sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]",
                    )}
                  >
                    <TableRow>
                      <SortHead label="Date" k="date" />
                      <SortHead label="Created By" k="createdByName" />
                      <SortHead label="Created" k="createdAt" />
                      <SortHead label="Last Updated" k="updatedAt" />
                      <TableHead className="text-right">Production (MT)</TableHead>
                      <TableHead className="text-right">Sales (MT)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/reports/${r.id}`)}
                              className="hover:text-primary hover:underline"
                            >
                              {format(parseISO(r.date), "dd MMM yyyy")}
                            </button>
                            <div className="text-xs font-normal text-muted-foreground">
                              {format(parseISO(r.date), "EEEE")}
                            </div>
                          </TableCell>
                          <TableCell>{r.createdByName}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(parseISO(r.createdAt), "dd MMM, HH:mm")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(parseISO(r.updatedAt), "dd MMM, HH:mm")}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(r.data.silo.production, {
                              decimals: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(r.data.silo.sales, { decimals: 2 })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.status === "final" ? "success" : "secondary"
                              }
                              className="capitalize"
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <RowActions r={r} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pageRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-16 text-center text-sm text-muted-foreground"
                        >
                          No reports match your filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile report cards */}
              {/* Mobile keeps a single scroll surface — the page itself — so a
                  whole month simply scrolls with it rather than trapping the
                  finger inside a nested scroller. */}
              <div className="space-y-3 p-3 md:hidden">
                {pageRows.map((r) => {
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => navigate(`/reports/${r.id}`)}
                        >
                          <div className="text-base font-semibold">
                            {format(parseISO(r.date), "dd MMM yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(parseISO(r.date), "EEEE")}
                          </div>
                        </button>
                        <Badge
                          variant={
                            r.status === "final" ? "success" : "secondary"
                          }
                          className="capitalize"
                        >
                          {r.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-y-2 border-t border-border pt-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">Production</div>
                          <div className="font-medium tabular-nums text-foreground">
                            {formatNumber(r.data.silo.production, {
                              decimals: 2,
                            })}{" "}
                            MT
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Sales</div>
                          <div className="font-medium tabular-nums text-foreground">
                            {formatNumber(r.data.silo.sales, { decimals: 2 })} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Created By</div>
                          <div className="font-medium text-foreground">
                            {r.createdByName}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Last Updated</div>
                          <div className="font-medium text-foreground">
                            {format(parseISO(r.updatedAt), "dd MMM, HH:mm")}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-border pt-2">
                        <RowActions r={r} />
                      </div>
                    </div>
                  );
                })}
                {pageRows.length === 0 && (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No reports match your filters.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Month view has no pager, so the count is stated instead — the
              scroll area otherwise gives no sense of how much is in it. */}
          {reports && monthView && (
            <div className="border-t border-border p-4 text-sm text-muted-foreground">
              {filtered.length} report{filtered.length === 1 ? "" : "s"} in{" "}
              {MONTHS[Number(month)]}
              {year !== "all" ? ` ${year}` : ""}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border p-4">
              <div className="text-sm text-muted-foreground">
                Page {safePage} of {totalPages}
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile: floating create button */}
      {canCreate && (
        <button
          onClick={() => navigate("/reports/new")}
          aria-label="Create new report"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-transform active:scale-95 md:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Mobile: filters bottom sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filter reports</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Month</label>
              <Select
                value={month}
                onValueChange={(v) => {
                  setMonth(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Year</label>
              <Select
                value={year}
                onValueChange={(v) => {
                  setYear(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                onClick={() => {
                  setMonth("all");
                  setYear("all");
                  resetPage();
                }}
              >
                Clear
              </Button>
              <Button
                className="flex-1"
                size="lg"
                onClick={() => setFiltersOpen(false)}
              >
                Show {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </Button>
            </div>

            {/* Bulk tools. They live in the desktop toolbar, which is hidden on
                a phone — without this an administrator on mobile would have no
                route to them at all. */}
            {canBulk && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Bulk data (admin)</p>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="justify-start"
                    onClick={() => {
                      setFiltersOpen(false);
                      onDownloadTemplate();
                    }}
                  >
                    <FileDown className="h-4 w-4" />
                    Download Template
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="justify-start"
                    disabled={importing}
                    onClick={() => {
                      setFiltersOpen(false);
                      importCsvRef.current?.click();
                    }}
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Import Reports
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="justify-start"
                    onClick={() => {
                      setFiltersOpen(false);
                      onExportCsv();
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export Reports
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(toRevert)}
        onOpenChange={(o) => !o && setToRevert(null)}
        title="Revert to draft?"
        description={
          toRevert
            ? `The report for ${format(parseISO(toRevert.date), "dd MMM yyyy")} will become editable again and will drop off the cement bin card until it is marked final once more. Later balances will be recalculated.`
            : ""
        }
        confirmLabel="Revert to Draft"
        loading={reverting}
        onConfirm={doRevert}
      />

      {/* Import results — shown after every import, successful or not, so a
          partial load is never silent. */}
      <Dialog
        open={Boolean(importResult)}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import finished</DialogTitle>
            <DialogDescription>
              Rows are matched to existing reports by date and updated in place.
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Created", value: importResult.created },
                  { label: "Updated", value: importResult.updated },
                  { label: "Shipments", value: importResult.shipments },
                  { label: "Skipped", value: importResult.skipped },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-border bg-muted/30 p-3 text-center"
                  >
                    <div className="text-2xl font-bold tabular-nums">
                      {s.value}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* A date order that had to be inferred is always shown. Reading
                  7/1 as the wrong month would misfile a day's stock silently,
                  so the guess is put in front of the user to check. */}
              {importResult.dateFormat && (
                <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  Dates in this file were read as{" "}
                  <span className="font-semibold text-foreground">
                    {importResult.dateFormat}
                  </span>
                  . Check a row or two — if that is wrong, re-save the file using
                  YYYY-MM-DD and import again.
                </p>
              )}

              {importResult.errors.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-destructive">
                    {importResult.errors.length} row
                    {importResult.errors.length === 1 ? "" : "s"} could not be
                    imported
                  </p>
                  <div className="max-h-56 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 scrollbar-thin">
                    <ul className="space-y-1 text-xs text-destructive">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fix those rows and import the file again — the rows that
                    succeeded will simply be updated rather than duplicated.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete report?"
        description={
          toDelete
            ? `The stock report for ${format(parseISO(toDelete.date), "dd MMM yyyy")} will be permanently removed. This cannot be undone.`
            : ""
        }
        destructive
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}
