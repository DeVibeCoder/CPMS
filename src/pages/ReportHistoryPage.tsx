import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  Trash2,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { repo } from "@/data";
import { useAuth, can } from "@/store/auth";
import { useSettings } from "@/store/settings";
import type { Report } from "@/types";
import { computeTotals } from "@/lib/calculations";
import { downloadReportPdf, printReportPdf } from "@/lib/pdf";
import { formatNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type SortKey = "date" | "createdByName" | "createdAt" | "updatedAt";
const PAGE_SIZE = 10;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ReportHistoryPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const settings = useSettings((s) => s.settings);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [query, setQuery] = useState("");
  // Default to the current month so today's reporting period is shown first.
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [year, setYear] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  const RowActionsMenu = ({ r }: { r: Report }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate(`/reports/${r.id}`)}>
          <Eye className="h-4 w-4" /> View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/reports/${r.id}/edit`)}>
          <Pencil className="h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => settings && printReportPdf(r, settings)}>
          <Printer className="h-4 w-4" /> Print
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => settings && downloadReportPdf(r, settings)}
        >
          <Download className="h-4 w-4" /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doDuplicate(r)}>
          <Copy className="h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        {can(user?.role, "deleteReports") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setToDelete(r)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
              Filters
              {activeFilters > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>

            <Button
              className="hidden shrink-0 sm:ml-1 md:inline-flex"
              onClick={() => navigate("/reports/new")}
            >
              <FilePlus2 className="h-4 w-4" />
              Create New Report
            </Button>
          </div>

          {!reports ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Date" k="date" />
                      <SortHead label="Created By" k="createdByName" />
                      <SortHead label="Created" k="createdAt" />
                      <SortHead label="Last Updated" k="updatedAt" />
                      <TableHead className="text-right">Cement (MT)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const t = computeTotals(r.data);
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
                            {formatNumber(t.totalCementMt, { decimals: 0 })}
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
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View"
                                onClick={() => navigate(`/reports/${r.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit"
                                onClick={() => navigate(`/reports/${r.id}/edit`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <RowActionsMenu r={r} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pageRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
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
              <div className="space-y-3 p-3 md:hidden">
                {pageRows.map((r) => {
                  const t = computeTotals(r.data);
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
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={
                              r.status === "final" ? "success" : "secondary"
                            }
                            className="capitalize"
                          >
                            {r.status}
                          </Badge>
                          <RowActionsMenu r={r} />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-y-2 border-t border-border pt-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">Created By</div>
                          <div className="font-medium text-foreground">
                            {r.createdByName}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cement</div>
                          <div className="font-medium tabular-nums text-foreground">
                            {formatNumber(t.totalCementMt, { decimals: 0 })} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Last Updated</div>
                          <div className="font-medium text-foreground">
                            {format(parseISO(r.updatedAt), "dd MMM, HH:mm")}
                          </div>
                        </div>
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
      <button
        onClick={() => navigate("/reports/new")}
        aria-label="Create new report"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-transform active:scale-95 md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

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
          </div>
        </SheetContent>
      </Sheet>

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
