import { useMemo, useRef, useState } from "react";
import { Download, Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/store/auth";
import {
  ALL_SLOTS,
  CAPACITY,
  CAPACITY_NOTE,
  CHART_FOOTER,
  CHART_TITLE,
  COUNT_LABELS,
  COUNT_ORDER,
  DISPATCH_GROUPS,
  DISPATCH_OFFICER,
  JUMBO_NOTE,
  JUMBO_POINTS,
  JUMBO_SUBNOTE,
  MANAGER,
  PLANT_GROUPS,
  SUPERVISOR_DISPATCH,
  SUPERVISOR_PRODUCTION,
  type ChartGroup,
  type ChartSlot,
} from "@/lib/attendance/orgChart";
import { awayOn, hasExited, isLeaving } from "@/lib/attendance/staff";
import type { Employee } from "@/types/attendance";
import type { Timesheets } from "./useTimesheets";
import { EmployeePicker } from "./StatusTab";

/**
 * How a post reads once you know who is in it.
 *
 * `gone` is the case the colour rules exist for: somebody whose exit date has
 * passed leaves the post behind them. The box stays, still named with its
 * designation, still red — because a red empty box is a post the plant has to
 * fill, and blanking it would quietly shrink the establishment instead.
 */
type SlotState = "vacant" | "filled" | "leaving" | "gone" | "vacation" | "away";

function slotState(
  employee: Employee | undefined,
  sheets: Timesheets,
): SlotState {
  if (!employee) return "vacant";
  const { departures, today } = sheets;
  if (hasExited(departures, employee.id, today)) return "gone";
  if (isLeaving(departures, employee.id, today)) return "leaving";

  const away = awayOn(departures, employee.id, today);
  if (away?.type === "vacation") return "vacation";
  if (away) return "away";
  return "filled";
}

/**
 * The sheet of paper the chart is made to fit.
 *
 * Letter landscape, in inches, because that is what the plant prints on. CSS
 * lays out at 96px to the inch, so the printable box below is what the chart has
 * to be scaled into; the export renders the same page at a resolution worth
 * printing from.
 */
const PAGE = {
  name: "letter landscape",
  width: 11,
  height: 8.5,
  margin: 0.3,
} as const;

const CSS_DPI = 96;
const EXPORT_DPI = 200;

/** What is left of the page once the margins are taken off, in CSS pixels. */
const PRINTABLE = {
  width: (PAGE.width - 2 * PAGE.margin) * CSS_DPI,
  height: (PAGE.height - 2 * PAGE.margin) * CSS_DPI,
};

/** Red for an exit, blue for a vacation — the same colours the tabs use. */
const SLOT_STYLE: Record<SlotState, string> = {
  vacant: "border-dashed border-border bg-muted/30 text-muted-foreground",
  filled: "border-border bg-card",
  leaving: "border-destructive/50 bg-destructive/[0.08]",
  gone: "border-dashed border-destructive/60 bg-destructive/[0.08]",
  vacation: "border-info/50 bg-info/[0.10]",
  away: "border-warning/50 bg-warning/[0.10]",
};

export function OrgChartTab({ sheets }: { sheets: Timesheets }) {
  const [editing, setEditing] = useState<ChartSlot | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = useAuth((s) => s.user?.role === "admin");

  const byId = useMemo(
    () => new Map(sheets.roster.map((e) => [e.id, e])),
    [sheets.roster],
  );

  /** Who is in each post, and how that post should read. */
  const held = (slot: ChartSlot) => {
    const employee = byId.get(sheets.chart[slot.id] ?? "");
    return { employee, state: slotState(employee, sheets) };
  };

  /**
   * The manpower summary, counted off the chart rather than typed.
   *
   * Posts and filled posts are counted separately so a vacancy shows as
   * "2 (of 3 posts)" the way the plant's own sheet writes it.
   */
  const manpower = useMemo(() => {
    const posts = new Map<string, { posts: number; filled: number }>();
    for (const slot of ALL_SLOTS) {
      const row = posts.get(slot.counts) ?? { posts: 0, filled: 0 };
      row.posts += 1;
      const employee = byId.get(sheets.chart[slot.id] ?? "");
      // Somebody who has left is not manpower, even though the post remains.
      if (employee && !hasExited(sheets.departures, employee.id, sheets.today)) {
        row.filled += 1;
      }
      posts.set(slot.counts, row);
    }
    return posts;
  }, [byId, sheets.chart, sheets.departures, sheets.today]);

  const totalFilled = [...manpower.values()].reduce((n, r) => n + r.filled, 0);

  /** Staff not already in a post, plus whoever holds the one being edited. */
  const assignable = useMemo(() => {
    const taken = new Set(Object.values(sheets.chart));
    const current = editing ? sheets.chart[editing.id] : undefined;
    return sheets.employees.filter((e) => !taken.has(e.id) || e.id === current);
  }, [sheets.employees, sheets.chart, editing]);

  /**
   * Lay the chart out on a sheet of paper, do something with it, put it back.
   *
   * Both the printer and the PNG want the same thing: the chart at a fixed
   * width, in the two-column form, with the on-screen furniture gone. On screen
   * it is responsive, and what it happens to look like in this browser window is
   * not what should come out of a printer — a chart that reflows to one column
   * on a laptop would print as a two-page ribbon.
   *
   * So the paper layout is a class, applied for as long as the capture takes and
   * removed in a `finally` so a cancelled print dialog cannot leave the page
   * stuck in it.
   */
  const onPaper = async <T,>(
    run: (sheet: HTMLDivElement) => T | Promise<T>,
  ): Promise<T | undefined> => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    sheet.classList.add("chart-page");
    try {
      return await run(sheet);
    } finally {
      sheet.classList.remove("chart-page");
    }
  };

  /**
   * Print the chart on one Letter page, landscape.
   *
   * Two things have to be said, and neither can be said in the stylesheet alone.
   * The paper is chosen by an `@page` rule, which has no selector and so cannot
   * be scoped to this component — it is injected for the duration of the print
   * and taken out again, otherwise printing a stock report from anywhere else in
   * the app would come out landscape too.
   *
   * The fit is the other. Whether the chart is shorter or taller than the page
   * depends on how many posts the chart has, so it is measured and scaled rather
   * than guessed at; `Math.min(1, …)` keeps a chart that already fits at its
   * proper size instead of blowing it up to fill the sheet.
   */
  const onPrint = () =>
    onPaper((sheet) => {
      const root = document.documentElement;
      const scale = Math.min(
        1,
        PRINTABLE.width / sheet.offsetWidth,
        PRINTABLE.height / sheet.offsetHeight,
      );
      root.style.setProperty("--chart-print-scale", String(scale));
      // A scale is painted, not laid out: the box keeps its full height and
      // would carry a second, empty page behind it. See the print stylesheet.
      root.style.setProperty(
        "--chart-print-height",
        `${Math.ceil(sheet.offsetHeight * scale)}px`,
      );

      // Everything between the chart and <body> is marked so the print
      // stylesheet can keep the chain and drop the rest of the app.
      const ancestors: HTMLElement[] = [];
      for (
        let el = sheet.parentElement;
        el && el !== document.body;
        el = el.parentElement
      ) {
        el.classList.add("chart-print-ancestor");
        ancestors.push(el);
      }

      const page = document.createElement("style");
      page.textContent = `@page { size: ${PAGE.name}; margin: ${PAGE.margin}in; }`;
      document.head.append(page);

      root.classList.add("printing-chart");
      try {
        window.print();
      } finally {
        root.classList.remove("printing-chart");
        root.style.removeProperty("--chart-print-scale");
        root.style.removeProperty("--chart-print-height");
        for (const el of ancestors) el.classList.remove("chart-print-ancestor");
        page.remove();
      }
    });

  /**
   * Download the chart as a PNG, on the same Letter landscape page.
   *
   * An image rather than a PDF: this gets pasted into notices and messages, and
   * the library is already in the bundle for the report exports.
   *
   * The capture is then drawn onto a page-shaped canvas rather than saved as it
   * comes, so the file somebody prints from their phone is the sheet the Print
   * button produces — same paper, same margins, same fit — instead of a
   * chart-shaped image the printer has to guess how to place.
   */
  const onDownload = async () => {
    setSaving(true);
    try {
      await onPaper(async (sheet) => {
        const { default: html2canvas } = await import("html2canvas");
        const shot = await html2canvas(sheet, {
          backgroundColor: "#ffffff",
          scale: 3,
          width: sheet.offsetWidth,
          height: sheet.offsetHeight,
          // The sheet is deliberately wider than a narrow window while it is
          // being captured, and html2canvas would otherwise clip it to the
          // window it thinks it is rendering into.
          windowWidth: Math.max(sheet.offsetWidth, window.innerWidth),
          windowHeight: Math.max(sheet.offsetHeight, window.innerHeight),
        });

        const page = document.createElement("canvas");
        page.width = Math.round(PAGE.width * EXPORT_DPI);
        page.height = Math.round(PAGE.height * EXPORT_DPI);
        const ctx = page.getContext("2d");
        if (!ctx) throw new Error("This browser cannot draw the page.");

        // Paper is white whatever the app's theme is doing.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, page.width, page.height);

        const margin = PAGE.margin * EXPORT_DPI;
        const fit = Math.min(
          (page.width - 2 * margin) / shot.width,
          (page.height - 2 * margin) / shot.height,
        );
        const width = shot.width * fit;
        const height = shot.height * fit;
        ctx.drawImage(
          shot,
          (page.width - width) / 2,
          (page.height - height) / 2,
          width,
          height,
        );

        const link = document.createElement("a");
        link.download = "cpsm-org-chart-letter-landscape.png";
        link.href = page.toDataURL("image/png");
        link.click();
      });
      toast({
        variant: "success",
        title: "Chart downloaded",
        description: "One Letter page, landscape — print it at 100%.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "The chart could not be saved",
        description: "Use Print instead, and choose Save as PDF.",
      });
    } finally {
      setSaving(false);
    }
  };

  const Slot = ({ slot, wide }: { slot: ChartSlot; wide?: boolean }) => {
    const { employee, state } = held(slot);
    const gone = state === "gone";

    return (
      <button
        type="button"
        disabled={!isAdmin}
        onClick={() => isAdmin && setEditing(slot)}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-center transition-colors",
          SLOT_STYLE[state],
          isAdmin && "cursor-pointer hover:border-primary/60",
          !isAdmin && "cursor-default",
          wide && "px-4 py-2.5",
        )}
      >
        <div
          className={cn(
            "text-[13px] font-semibold leading-tight",
            (state === "vacant" || gone) && "text-muted-foreground",
            gone && "text-destructive/80",
          )}
        >
          {employee && !gone ? employee.name : "VACANT"}
        </div>
        <div className="text-[11px] leading-tight text-muted-foreground">
          {slot.title}
        </div>
      </button>
    );
  };

  const Group = ({ group }: { group: ChartGroup }) => (
    <div className="chart-group min-w-[210px] flex-1 space-y-1.5">
      <div className="rounded-md bg-primary/85 px-3 py-1.5 text-center text-[13px] font-bold tracking-wide text-primary-foreground">
        {group.label}
      </div>
      {group.slots.map((s) => (
        <Slot key={s.id} slot={s} />
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar — not part of what prints or downloads. */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Click any box to put somebody in that post. Posts are fixed; who fills them is not."
            : "Posts and who fills them. Only an administrator can change assignments."}{" "}
          Print and Download both give one Letter page, landscape.
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={onDownload}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      {/* `print-sheet` is what the print stylesheet scopes to, and `chart-page`
          is added to this same element while a print or a download is running —
          see `onPaper`. Nothing here uses `print:` utilities: the layout is
          measured just before printing, and a rule that changed it afterwards
          would make that measurement a lie. */}
      <div
        ref={sheetRef}
        className="print-sheet chart-sheet rounded-lg border border-border bg-card"
      >
        <div className="border-b border-border pb-3 text-center">
          <h2 className="text-lg font-bold tracking-tight">{CHART_TITLE}</h2>
        </div>

        {/* Manager */}
        <div className="mx-auto max-w-[280px]">
          <div className="rounded-md bg-foreground px-4 py-2.5 text-center text-background">
            <div className="text-[13px] font-bold">
              {held(MANAGER).employee?.name ?? "VACANT"}
            </div>
            <div className="text-[11px] opacity-80">{MANAGER.title}</div>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="chart-screen-only mt-1 w-full text-center text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setEditing(MANAGER)}
            >
              assign
            </button>
          )}
        </div>

        {/* The two branches */}
        <div className="chart-branches grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="mx-auto max-w-[320px] space-y-1.5">
              <Slot slot={SUPERVISOR_DISPATCH} wide />
              <Slot slot={DISPATCH_OFFICER} wide />
            </div>
            <div className="flex flex-wrap gap-3">
              {DISPATCH_GROUPS.map((g) => (
                <Group key={g.id} group={g} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="mx-auto max-w-[320px]">
              <Slot slot={SUPERVISOR_PRODUCTION} wide />
            </div>
            <div className="flex flex-wrap gap-3">
              {PLANT_GROUPS.map((g) => (
                <Group key={g.id} group={g} />
              ))}
            </div>
          </div>
        </div>

        {/* Jumbo points — shown, but not counted. */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap justify-center gap-3">
            {JUMBO_POINTS.map((p) => (
              <div key={p.id} className="min-w-[150px] flex-1 space-y-1.5">
                <div className="rounded-md bg-primary/85 px-3 py-1.5 text-center text-[12px] font-bold tracking-wide text-primary-foreground">
                  {p.label}
                </div>
                {p.crew.map((line) => (
                  <div
                    key={line}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-center text-[11px] text-muted-foreground"
                  >
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[12px] font-medium">{JUMBO_NOTE}</p>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            {JUMBO_SUBNOTE}
          </p>
        </div>

        {/* Footnotes. Manpower is counted off the chart; capacity is not, and
            is reproduced from the plant's own sheet. */}
        <div className="chart-notes grid gap-6 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-bold tracking-wide">MANPOWER</h3>
            <ul className="space-y-1 text-[12px]">
              {COUNT_ORDER.map((line) => {
                const row = manpower.get(line);
                if (!row) return null;
                const short = row.filled < row.posts;
                return (
                  <li key={line} className="flex items-baseline gap-1.5">
                    <span className="text-muted-foreground">
                      {COUNT_LABELS[line]}:
                    </span>
                    <span className="font-semibold tabular-nums">{row.filled}</span>
                    {short && (
                      <span className="text-[11px] text-destructive">
                        (of {row.posts} posts — {row.posts - row.filled} vacant)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 border-t border-border pt-2 text-[13px] font-bold">
              TOTAL: {totalFilled}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                of {ALL_SLOTS.length} posts
              </span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-bold tracking-wide">
              PRODUCTIVE CAPACITY
            </h3>
            <table className="text-[12px]">
              <tbody>
                {CAPACITY.map((c) => (
                  <tr key={c.label}>
                    <td className="pr-4 text-muted-foreground">{c.label}</td>
                    <td className="pr-3 font-bold">{c.value}</td>
                    <td className="text-[11px] text-muted-foreground">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="mb-1 mt-4 text-[13px] font-bold tracking-wide">NOTE</h3>
            <p className="max-w-prose text-[12px] leading-snug text-muted-foreground">
              {CAPACITY_NOTE}
            </p>
          </div>
        </div>

        <p className="text-right text-[10px] text-muted-foreground">
          {CHART_FOOTER}
        </p>
      </div>

      <AssignDialog
        slot={editing}
        onClose={() => setEditing(null)}
        sheets={sheets}
        assignable={assignable}
      />
    </div>
  );
}

/** Put somebody in one post, or clear it. */
function AssignDialog({
  slot,
  onClose,
  sheets,
  assignable,
}: {
  slot: ChartSlot | null;
  onClose: () => void;
  sheets: Timesheets;
  assignable: Employee[];
}) {
  const currentId = slot ? sheets.chart[slot.id] : undefined;
  const current = sheets.roster.find((e) => e.id === currentId);

  return (
    <Dialog open={Boolean(slot)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{slot?.title}</DialogTitle>
          <DialogDescription>
            Search by Emp ID or name. Somebody already in another post is moved
            here rather than being counted twice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {current && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{current.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {current.id}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (slot) sheets.assignSlot(slot.id, null);
                  onClose();
                }}
              >
                <X className="h-3.5 w-3.5" />
                Empty this post
              </Button>
            </div>
          )}

          <EmployeePicker
            employees={assignable}
            value={currentId ?? ""}
            onChange={(employeeId) => {
              if (slot) sheets.assignSlot(slot.id, employeeId);
              onClose();
            }}
          />

          {assignable.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Everybody on the staff list already holds a post. Add staff, or
              empty a post first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
