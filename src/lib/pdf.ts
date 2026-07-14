import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Styles } from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import type { CompanySettings, Report } from "@/types";
import { computeTotals } from "@/lib/calculations";
import { formatNumber } from "@/lib/utils";

/**
 * PDF generation — a print-accurate replica of the plant's master daily stock
 * report. Layout, colours, column structure and spacing mirror the source
 * document 1:1. All palette/geometry constants are centralised here so the
 * output can be fine-tuned against the master.
 */

// ---- Palette (matches the master report) ----
const NAVY: [number, number, number] = [35, 70, 110]; // section title bars
const SLATE: [number, number, number] = [91, 111, 136]; // top-table col headers
const BLUE: [number, number, number] = [63, 116, 184]; // wide-table col headers
const CREAM: [number, number, number] = [251, 243, 226]; // silo highlight rows
const BORDER: [number, number, number] = [150, 165, 185];
const TEXT: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 120, 140];

const MARGIN = 34;
const GAP = 12;

function n(v: number, decimals?: number): string {
  return formatNumber(v, decimals !== undefined ? { decimals } : {});
}

interface Col {
  header: string;
  width: number;
}

/** A body cell; string for plain, object for styled (bold / fill). */
type Cell = string | { content: string; bold?: boolean };

function bodyCell(c: Cell): string | { content: string; styles: Partial<Styles> } {
  if (typeof c === "string") return c;
  const styles: Partial<Styles> = {};
  if (c.bold) styles.fontStyle = "bold";
  return { content: c.content, styles };
}

interface TableOpts {
  doc: jsPDF;
  startY: number;
  x: number;
  width: number;
  title: string;
  subColor: [number, number, number];
  columns: Col[];
  rows: Cell[][];
  /** Optional per-row background fill (e.g. silo cream rows). */
  rowFill?: (rowIndex: number) => [number, number, number] | undefined;
}

/** Draws one titled table and returns its bottom Y coordinate. */
function drawTable(opts: TableOpts): number {
  const { doc, columns } = opts;
  const columnStyles: Record<number, Partial<Styles>> = {};
  columns.forEach((c, i) => {
    columnStyles[i] = { cellWidth: c.width, halign: "left" };
  });

  autoTable(doc, {
    startY: opts.startY,
    margin: { left: opts.x },
    tableWidth: opts.width,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.3,
      cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
      lineColor: BORDER,
      lineWidth: 0.5,
      textColor: TEXT,
      valign: "middle",
      overflow: "linebreak",
    },
    columnStyles,
    head: [
      [
        {
          content: opts.title,
          colSpan: columns.length,
          styles: {
            fillColor: NAVY,
            textColor: [255, 255, 255],
            halign: "center",
            fontStyle: "bold",
            fontSize: 9.5,
          },
        },
      ],
      columns.map((c) => ({
        content: c.header,
        styles: {
          fillColor: opts.subColor,
          textColor: [255, 255, 255],
          fontStyle: "bold" as const,
          halign: "left" as const,
        },
      })),
    ],
    body: opts.rows.map((r) => r.map(bodyCell)),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const fill = opts.rowFill?.(data.row.index);
      if (fill) data.cell.styles.fillColor = fill;
    },
  });

  // @ts-expect-error lastAutoTable is injected by the plugin
  return doc.lastAutoTable.finalY as number;
}

export function generateReportPdf(
  report: Report,
  settings: CompanySettings,
): jsPDF {
  const d = report.data;
  const t = computeTotals(d);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  const half = (contentW - GAP) / 2;
  const rightX = MARGIN + half + GAP;

  // ---------- Title: "CEMENT STOCK (dd/MM/yyyy)" ----------
  const dateStr = format(parseISO(report.date), "dd/MM/yyyy");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 20, 20);
  doc.text(
    `${settings.reportTitle.toUpperCase()}  (${dateStr})`,
    pageW / 2,
    46,
    { align: "center" },
  );

  const top = 64;

  // ---------- Row 1: 50KG Bags | Jumbo Bags ----------
  const y50 = drawTable({
    doc,
    startY: top,
    x: MARGIN,
    width: half,
    title: "50KG BAGS STOCK",
    subColor: SLATE,
    columns: [
      { header: "Location", width: half * 0.48 },
      { header: "Quantity", width: half * 0.28 },
      { header: "Unit", width: half * 0.24 },
    ],
    rows: [
      ["Cement Jetty Stock", n(d.bags50kg.cementJetty), "Bags"],
      ["Godown Stock", n(d.bags50kg.godown), "Bags"],
      ["Q-Marine Jetty", n(d.bags50kg.qMarineJetty), "Bags"],
      [
        { content: "Total Cement", bold: true },
        { content: n(t.total50kgBags), bold: true },
        { content: "Bags", bold: true },
      ],
    ],
  });

  const yJumbo = drawTable({
    doc,
    startY: top,
    x: rightX,
    width: half,
    title: "JUMBO BAGS STOCK",
    subColor: SLATE,
    columns: [
      { header: "Location", width: half * 0.44 },
      { header: "Quantity", width: half * 0.28 },
      { header: "Unit", width: half * 0.28 },
    ],
    rows: [
      ["Cement Jetty Stock", n(d.jumbo.cementJetty), "Jumbo Bags"],
      [
        { content: "Total Cement", bold: true },
        { content: n(t.totalCementMt, 3), bold: true },
        { content: "MT", bold: true },
      ],
    ],
  });

  let cursorY = Math.max(y50, yJumbo) + GAP;

  // ---------- Row 2: Silo Balance (left half) ----------
  cursorY =
    drawTable({
      doc,
      startY: cursorY,
      x: MARGIN,
      width: half,
      title: "SILO BALANCE",
      subColor: SLATE,
      columns: [
        { header: "Category", width: half * 0.6 },
        { header: "Quantity (MT)", width: half * 0.4 },
      ],
      rows: [
        ["Current Stock", n(d.silo.currentStock, 2)],
        ["Sales", n(d.silo.sales, 2)],
        ["Production", n(d.silo.production, 2)],
      ],
      rowFill: (i) => (i >= 1 ? CREAM : undefined),
    }) + GAP;

  // ---------- Row 3: 50KG Empty Bags Stock (full width) ----------
  const w5 = contentW * 0.144;
  cursorY =
    drawTable({
      doc,
      startY: cursorY,
      x: MARGIN,
      width: contentW,
      title: "50KG EMPTY BAGS STOCK",
      subColor: BLUE,
      columns: [
        { header: "Location", width: contentW * 0.28 },
        { header: "Plant [01]", width: w5 },
        { header: "Plant [02]", width: w5 },
        { header: "Plant [03]", width: w5 },
        { header: "G-Store", width: w5 },
        { header: "Total", width: w5 },
      ],
      rows: [
        [
          "Quantity (Nos) China bags",
          n(d.emptyBags50kg.china.plant01),
          n(d.emptyBags50kg.china.plant02),
          n(d.emptyBags50kg.china.plant03),
          n(d.emptyBags50kg.china.gStore),
          { content: n(t.chinaTotal), bold: true },
        ],
        [
          "Quantity (Nos) Indonesia",
          n(d.emptyBags50kg.indonesia.plant01),
          n(d.emptyBags50kg.indonesia.plant02),
          n(d.emptyBags50kg.indonesia.plant03),
          n(d.emptyBags50kg.indonesia.gStore),
          { content: n(t.indonesiaTotal), bold: true },
        ],
      ],
    }) + GAP;

  // ---------- Row 4: Empty Jumbo Bags (full width) ----------
  const w4 = contentW * 0.19;
  cursorY =
    drawTable({
      doc,
      startY: cursorY,
      x: MARGIN,
      width: contentW,
      title: "EMPTY JUMBO BAGS STOCK",
      subColor: BLUE,
      columns: [
        { header: "Location", width: contentW * 0.24 },
        { header: "Cement Godown", width: w4 },
        { header: "Cement Jetty", width: w4 },
        { header: "G-Store", width: w4 },
        { header: "Total", width: w4 },
      ],
      rows: [
        [
          "Quantity (Nos)",
          n(d.emptyJumbo.cementGodown),
          d.emptyJumbo.cementJetty === 0 ? "-" : n(d.emptyJumbo.cementJetty),
          n(d.emptyJumbo.gStore),
          { content: n(t.totalEmptyJumbo), bold: true },
        ],
      ],
    }) + GAP;

  // ---------- Row 5: Net Slings (full width) ----------
  const w3 = contentW * 0.2;
  cursorY =
    drawTable({
      doc,
      startY: cursorY,
      x: MARGIN,
      width: contentW,
      title: "NET SLINGS STOCK",
      subColor: BLUE,
      columns: [
        { header: "Location", width: contentW * 0.18 },
        { header: "Category", width: contentW * 0.22 },
        { header: "Cement Godown", width: w3 },
        { header: "G-Store", width: w3 },
        { header: "Total", width: w3 },
      ],
      rows: [
        [
          "Quantity (Nos)",
          "New Net Sling",
          n(d.netSlings.new.cementGodown),
          n(d.netSlings.new.gStore),
          { content: n(t.newSlingTotal), bold: true },
        ],
        [
          "Quantity (Nos)",
          "Used Net Sling",
          n(d.netSlings.used.cementGodown),
          n(d.netSlings.used.gStore),
          { content: n(t.usedSlingTotal), bold: true },
        ],
      ],
    }) + GAP;

  if (d.notes && d.notes.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Remarks:", MARGIN, cursorY + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(d.notes, contentW);
    doc.text(lines, MARGIN, cursorY + 19);
  }

  // ---------- Footer ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageH - 30, pageW - MARGIN, pageH - 30);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(settings.pdfFooter, MARGIN, pageH - 18);
    doc.text(
      `Prepared by ${report.createdByName}  •  Page ${i} of ${pageCount}`,
      pageW - MARGIN,
      pageH - 18,
      { align: "right" },
    );
  }

  return doc;
}

export function reportFileName(report: Report): string {
  return `Cement-Stock-${report.date}.pdf`;
}

export function downloadReportPdf(report: Report, settings: CompanySettings) {
  generateReportPdf(report, settings).save(reportFileName(report));
}

export function printReportPdf(report: Report, settings: CompanySettings) {
  const doc = generateReportPdf(report, settings);
  doc.autoPrint();
  const url = doc.output("bloburl");
  const win = window.open(url, "_blank");
  if (!win) doc.save(reportFileName(report));
}
