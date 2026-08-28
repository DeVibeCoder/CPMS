import { useMemo, useRef, useState, type CSSProperties } from "react";
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
  groupColumns,
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
type SlotState =
  | "vacant"
  | "filled"
  | "leaving"
  | "gone"
  | "vacation"
  | "sick"
  | "off-site";

function slotState(
  employee: Employee | undefined,
  sheets: Timesheets,
): SlotState {
  if (!employee) return "vacant";
  const { departures, today } = sheets;
  if (hasExited(departures, employee.id, today)) return "gone";
  if (isLeaving(departures, employee.id, today)) return "leaving";

  // A spell away keeps the colour it has on every other screen. Folding sick
  // and off site into one "away" wash made a sick man and a man on another
  // island the same colour, which is the one thing the palette exists to stop.
  const away = awayOn(departures, employee.id, today);
  if (away) return away.type as SlotState;
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

/** How wide one column of posts may be squeezed or stretched to fit the page. */
const COLUMN_RANGE = { min: 110, max: 340 };

/** Red for an exit, blue for a vacation — the same colours the tabs use. */
const SLOT_STYLE: Record<SlotState, string> = {
  vacant: "border border-dashed border-border bg-muted/40",
  filled: "border border-border bg-card",
  leaving: "border border-destructive/50 bg-destructive/[0.08]",
  gone: "border border-dashed border-destructive/60 bg-destructive/[0.08]",
  vacation: "border border-info/50 bg-info/[0.10]",
  sick: "border border-success/50 bg-success/[0.10]",
  "off-site": "border border-warning/50 bg-warning/[0.10]",
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
   * Set the chart's column width so it fills the page, and return what is left
   * to scale.
   *
   * Scaling alone fits the chart but does not *use* the page: a drawing taller
   * than it is wide shrinks until its height fits and leaves a band of white
   * down both sides. What decides the chart's proportions is the width of one
   * column of posts — the boxes are a fixed height, so widening the columns
   * makes the chart wider without making it any shorter.
   *
   * So the column width is searched for rather than chosen. Widen while the
   * chart still has width to spare, narrow once it has run out; nine halvings
   * land within a pixel, and each one costs a single reflow.
   */
  const fitToPage = (sheet: HTMLDivElement): number => {
    let narrow = COLUMN_RANGE.min;
    let wide = COLUMN_RANGE.max;

    for (let i = 0; i < 9; i += 1) {
      const column = (narrow + wide) / 2;
      sheet.style.setProperty("--org-col", `${column}px`);
      if (
        PRINTABLE.width / sheet.offsetWidth >
        PRINTABLE.height / sheet.offsetHeight
      ) {
        narrow = column;
      } else {
        wide = column;
      }
    }

    sheet.style.setProperty("--org-col", `${narrow}px`);
    // Never blown up past its natural size: a chart already smaller than the
    // page is a small chart, not a reason to interpolate it larger.
    return Math.min(
      1,
      PRINTABLE.width / sheet.offsetWidth,
      PRINTABLE.height / sheet.offsetHeight,
    );
  };

  /**
   * Lay the chart out on a sheet of paper, do something with it, put it back.
   *
   * Both the printer and the PNG want the same thing: the chart on one page,
   * filling it, with the on-screen furniture gone. So the paper layout is a
   * class, applied for as long as the capture takes and removed in a `finally`
   * so a cancelled print dialog cannot leave the page stuck in it.
   */
  const onPaper = async <T,>(
    run: (sheet: HTMLDivElement, scale: number) => T | Promise<T>,
  ): Promise<T | undefined> => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    sheet.classList.add("chart-page");
    try {
      return await run(sheet, fitToPage(sheet));
    } finally {
      sheet.style.removeProperty("--org-col");
      sheet.classList.remove("chart-page");
    }
  };

  /**
   * Print the chart on one Letter page, landscape.
   *
   * The paper is chosen by an `@page` rule, which has no selector and so cannot
   * be scoped to this component — it is injected for the duration of the print
   * and taken out again, otherwise printing a stock report from anywhere else in
   * the app would come out landscape too.
   */
  const onPrint = () =>
    onPaper((sheet, scale) => {
      const root = document.documentElement;
      root.style.setProperty("--chart-print-scale", String(scale));

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
        for (const el of ancestors) el.classList.remove("chart-print-ancestor");
        page.remove();
      }
    });

  /**
   * Download the chart as a PNG, on the same page.
   *
   * An image rather than a PDF: this gets pasted into notices and messages, and
   * the library is already in the bundle for the report exports.
   *
   * The capture is then drawn onto a page-shaped canvas rather than saved as it
   * comes, so the file somebody prints from their phone is the sheet the Print
   * button produces — same paper, same margins, same fit.
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

  /**
   * A command post — the manager, the supervisors, the dispatch officer.
   *
   * Dark, so the line of command reads down the page before any name does. Its
   * width is tied to the column width, so the whole chart re-proportions off
   * that one variable when it is fitted to paper.
   */
  const LeadBox = ({ slot, deep }: { slot: ChartSlot; deep?: boolean }) => {
    const { employee, state } = held(slot);
    const gone = state === "gone";
    return (
      <button
        type="button"
        disabled={!isAdmin}
        onClick={() => isAdmin && setEditing(slot)}
        className={cn(
          "org-box org-lead transition-opacity",
          deep && "org-lead--deep",
          isAdmin ? "cursor-pointer hover:opacity-90" : "cursor-default",
        )}
      >
        <div className="w-full truncate text-[12px] font-bold leading-tight">
          {employee && !gone ? employee.name : "VACANT"}
        </div>
        <div className="w-full truncate text-[10px] leading-tight text-white/70">
          {slot.title}
        </div>
      </button>
    );
  };

  /** One post on the shop floor. */
  const SlotBox = ({ slot }: { slot: ChartSlot }) => {
    const { employee, state } = held(slot);
    const empty = state === "vacant" || state === "gone";

    return (
      <button
        type="button"
        disabled={!isAdmin}
        onClick={() => isAdmin && setEditing(slot)}
        className={cn(
          "org-box w-full transition-colors",
          SLOT_STYLE[state],
          isAdmin ? "cursor-pointer hover:border-primary/60" : "cursor-default",
        )}
      >
        <div
          className={cn(
            "w-full truncate text-[12px] font-semibold leading-tight",
            empty && "text-muted-foreground",
            state === "gone" && "text-destructive/80",
          )}
        >
          {employee && state !== "gone" ? employee.name : "VACANT"}
        </div>
        <div className="w-full truncate text-[10px] leading-tight text-muted-foreground">
          {slot.title}
        </div>
      </button>
    );
  };

  /** The band naming a team, and the posts hanging off it. */
  const Group = ({ group }: { group: ChartGroup }) => {
    const columns = groupColumns(group);
    return (
      <div>
        <div
          className="org-box org-band"
          style={{ "--org-span": columns.length } as CSSProperties}
        >
          <span className="truncate text-[11px] font-bold tracking-wide">
            {group.label}
          </span>
        </div>
        <div className="org-stem" />
        <div className="org-fan">
          {columns.map((column) => (
            <div key={column[0].id} className="org-chain">
              {column.map((slot) => (
                <SlotBox key={slot.id} slot={slot} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

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

      {/* The chart keeps its drawn width and scrolls rather than reflowing, so
          what is on the screen is the drawing that comes off the printer. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
        {/* `print-sheet` is what the print stylesheet scopes to, and
            `chart-page` is added to this same element while a print or a
            download is running — see `onPaper`. Nothing here uses `print:`
            utilities: the layout is measured just before printing, and a rule
            that changed it afterwards would make that measurement a lie. */}
        <div ref={sheetRef} className="print-sheet chart-sheet">
          <div className="border-b border-border pb-2 text-center">
            <h2 className="text-[19px] font-bold tracking-tight">{CHART_TITLE}</h2>
          </div>

          <div>
            <LeadBox slot={MANAGER} deep />
            <div className="org-stem" />

            <div className="org-fan org-fan--branches">
              {/* Dispatch — one level deeper than production, because the
                  dispatch officer sits between the supervisor and the teams. */}
              <div className="org-branch">
                <LeadBox slot={SUPERVISOR_DISPATCH} />
                <div className="org-stem" />
                <LeadBox slot={DISPATCH_OFFICER} deep />
                <div className="org-stem" />
                <div className="org-fan">
                  {DISPATCH_GROUPS.map((g) => (
                    <Group key={g.id} group={g} />
                  ))}
                </div>
              </div>

              {/* Production. The long stem stands in for the dispatch officer's
                  row, so the two sets of team bands line up across the page. */}
              <div className="org-branch">
                <LeadBox slot={SUPERVISOR_PRODUCTION} />
                <div className="org-stem org-stem--past-officer" />
                <div className="org-fan">
                  {PLANT_GROUPS.map((g) => (
                    <Group key={g.id} group={g} />
                  ))}
                </div>

                {/* Jumbo points hang under the plants rather than beside them:
                    they are the same crews on a different line, which is what
                    the note under them says and why they are not counted. */}
                <div className="org-stem" />
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="org-fan">
                    {JUMBO_POINTS.map((point) => (
                      <div key={point.id}>
                        <div className="org-box org-band org-crew">
                          <span className="truncate text-[10px] font-bold tracking-wide">
                            {point.label}
                          </span>
                        </div>
                        <div className="org-stem" />
                        <div className="org-chain">
                          {point.crew.map((line) => (
                            <div
                              key={line}
                              className="org-box org-crew border border-border bg-card text-[10px] text-muted-foreground"
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-center text-[11px] font-medium">
                    {JUMBO_NOTE}
                  </p>
                  <p className="mt-0.5 text-center text-[10px] text-muted-foreground">
                    {JUMBO_SUBNOTE}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footnotes. Manpower is counted off the chart; capacity is not, and
              is reproduced from the plant's own sheet. */}
          <div className="grid grid-cols-2 gap-8 border-t border-border pt-3">
            <div>
              <h3 className="mb-1.5 text-[12px] font-bold tracking-wide">
                MANPOWER
              </h3>
              <ul className="space-y-0.5 text-[11px]">
                {COUNT_ORDER.map((line) => {
                  const row = manpower.get(line);
                  if (!row) return null;
                  const short = row.filled < row.posts;
                  return (
                    <li key={line} className="flex items-baseline gap-1.5">
                      <span className="text-muted-foreground">
                        {COUNT_LABELS[line]}:
                      </span>
                      <span className="font-semibold tabular-nums">
                        {row.filled}
                      </span>
                      {short && (
                        <span className="text-[10px] text-destructive">
                          (of {row.posts} posts — {row.posts - row.filled} vacant)
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1.5 border-t border-border pt-1.5 text-[12px] font-bold">
                TOTAL: {totalFilled}
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  of {ALL_SLOTS.length} posts
                </span>
              </div>
            </div>

            <div>
              <h3 className="mb-1.5 text-[12px] font-bold tracking-wide">
                PRODUCTIVE CAPACITY
              </h3>
              <table className="text-[11px]">
                <tbody>
                  {CAPACITY.map((c) => (
                    <tr key={c.label}>
                      <td className="pr-4 text-muted-foreground">{c.label}</td>
                      <td className="pr-3 font-bold">{c.value}</td>
                      <td className="text-[10px] text-muted-foreground">
                        {c.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="mb-0.5 mt-3 text-[12px] font-bold tracking-wide">
                NOTE
              </h3>
              {/* The sheet is sized to its content, so an unwrapped sentence
                  here would set the width of the entire chart — and it did,
                  pushing the drawing down to half size to make room for one
                  paragraph. Bounded in characters rather than pixels so it
                  keeps its shape as the chart is re-proportioned for paper. */}
              <p className="max-w-[58ch] text-[11px] leading-snug text-muted-foreground">
                {CAPACITY_NOTE}
              </p>
            </div>
          </div>

          <p className="text-right text-[10px] text-muted-foreground">
            {CHART_FOOTER}
          </p>
        </div>
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
