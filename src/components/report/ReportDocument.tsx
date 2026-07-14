import { format, parseISO } from "date-fns";
import type { CompanySettings, Report } from "@/types";
import { computeTotals } from "@/lib/calculations";
import { formatNumber } from "@/lib/utils";

/**
 * On-screen, print-accurate replica of the plant's master daily stock report.
 * Always renders on a white "paper" surface (independent of app theme) so what
 * you see equals the generated PDF and the printed page.
 *
 * Palette + structure mirror the source document 1:1.
 */

const C = {
  navy: "#23466e", // section title bars
  slate: "#5b6f88", // column headers (top tables + silo)
  blue: "#3f74b8", // column headers (wide tables)
  cream: "#fbf3e2", // silo highlighted rows
  border: "#b9c4d2",
  text: "#1a1a1a",
};

function num(v: number, decimals?: number) {
  return formatNumber(v, decimals !== undefined ? { decimals } : {});
}

/** Section title bar (navy, centered). */
function TitleBar({ children, span }: { children: string; span: number }) {
  return (
    <tr>
      <th
        colSpan={span}
        className="px-2 py-1.5 text-center text-[12.5px] font-bold uppercase tracking-wide text-white"
        style={{ backgroundColor: C.navy }}
      >
        {children}
      </th>
    </tr>
  );
}

interface Column {
  label: string;
  width: string;
}

function ColumnHeaders({ cols, color }: { cols: Column[]; color: string }) {
  return (
    <tr>
      {cols.map((c, i) => (
        <th
          key={i}
          className="border px-2 py-1.5 text-left text-[12px] font-semibold text-white"
          style={{ backgroundColor: color, borderColor: C.border, width: c.width }}
        >
          {c.label}
        </th>
      ))}
    </tr>
  );
}

function Cell({
  children,
  bold,
  fill,
  className = "",
}: {
  children: React.ReactNode;
  bold?: boolean;
  fill?: string;
  className?: string;
}) {
  return (
    <td
      className={`border px-2 py-1 text-[12px] ${bold ? "font-semibold" : ""} ${className}`}
      style={{ borderColor: C.border, backgroundColor: fill }}
    >
      {children}
    </td>
  );
}

function DocTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <table
      className={`w-full border-collapse text-left ${className}`}
      style={{ color: C.text }}
    >
      {children}
    </table>
  );
}

export function ReportDocument({
  report,
  settings,
}: {
  report: Report;
  settings: CompanySettings;
}) {
  const d = report.data;
  const t = computeTotals(d);
  const dateStr = format(parseISO(report.date), "dd/MM/yyyy");

  return (
    <div className="print-area mx-auto w-full max-w-[860px] bg-white px-6 py-6 shadow-card">
      {/* Title */}
      <div className="mb-4 text-center">
        <span className="text-[17px] font-bold tracking-tight text-slate-900">
          {settings.reportTitle.toUpperCase()}
        </span>
        <span className="ml-1 text-[17px] font-bold text-slate-900">
          ({dateStr})
        </span>
      </div>

      {/* Row 1 — 50KG Bags | Jumbo Bags side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DocTable>
          <thead>
            <TitleBar span={3}>50KG BAGS STOCK</TitleBar>
            <ColumnHeaders
              color={C.slate}
              cols={[
                { label: "Location", width: "48%" },
                { label: "Quantity", width: "28%" },
                { label: "Unit", width: "24%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Cement Jetty Stock</Cell>
              <Cell>{num(d.bags50kg.cementJetty)}</Cell>
              <Cell>Bags</Cell>
            </tr>
            <tr>
              <Cell>Godown Stock</Cell>
              <Cell>{num(d.bags50kg.godown)}</Cell>
              <Cell>Bags</Cell>
            </tr>
            <tr>
              <Cell>Q-Marine Jetty</Cell>
              <Cell>{num(d.bags50kg.qMarineJetty)}</Cell>
              <Cell>Bags</Cell>
            </tr>
            <tr>
              <Cell bold>Total Cement</Cell>
              <Cell bold>{num(t.total50kgBags)}</Cell>
              <Cell bold>Bags</Cell>
            </tr>
          </tbody>
        </DocTable>

        <DocTable>
          <thead>
            <TitleBar span={3}>JUMBO BAGS STOCK</TitleBar>
            <ColumnHeaders
              color={C.slate}
              cols={[
                { label: "Location", width: "44%" },
                { label: "Quantity", width: "28%" },
                { label: "Unit", width: "28%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Cement Jetty Stock</Cell>
              <Cell>{num(d.jumbo.cementJetty)}</Cell>
              <Cell>Jumbo Bags</Cell>
            </tr>
            <tr>
              <Cell bold>Total Cement</Cell>
              <Cell bold>{num(t.totalCementMt, 3)}</Cell>
              <Cell bold>MT</Cell>
            </tr>
          </tbody>
        </DocTable>
      </div>

      {/* Row 2 — Silo Balance (left half) */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2">
        <DocTable>
          <thead>
            <TitleBar span={2}>SILO BALANCE</TitleBar>
            <ColumnHeaders
              color={C.slate}
              cols={[
                { label: "Category", width: "60%" },
                { label: "Quantity (MT)", width: "40%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Current Stock</Cell>
              <Cell>{num(d.silo.currentStock, 2)}</Cell>
            </tr>
            <tr>
              <Cell fill={C.cream}>Sales</Cell>
              <Cell fill={C.cream}>{num(d.silo.sales, 2)}</Cell>
            </tr>
            <tr>
              <Cell fill={C.cream}>Production</Cell>
              <Cell fill={C.cream}>{num(d.silo.production, 2)}</Cell>
            </tr>
          </tbody>
        </DocTable>
      </div>

      {/* Row 3 — 50KG Empty Bags Stock (full width) */}
      <div className="mt-4">
        <DocTable>
          <thead>
            <TitleBar span={6}>50KG EMPTY BAGS STOCK</TitleBar>
            <ColumnHeaders
              color={C.blue}
              cols={[
                { label: "Location", width: "28%" },
                { label: "Plant [01]", width: "14.4%" },
                { label: "Plant [02]", width: "14.4%" },
                { label: "Plant [03]", width: "14.4%" },
                { label: "G-Store", width: "14.4%" },
                { label: "Total", width: "14.4%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Quantity (Nos) China bags</Cell>
              <Cell>{num(d.emptyBags50kg.china.plant01)}</Cell>
              <Cell>{num(d.emptyBags50kg.china.plant02)}</Cell>
              <Cell>{num(d.emptyBags50kg.china.plant03)}</Cell>
              <Cell>{num(d.emptyBags50kg.china.gStore)}</Cell>
              <Cell bold>{num(t.chinaTotal)}</Cell>
            </tr>
            <tr>
              <Cell>Quantity (Nos) Indonesia</Cell>
              <Cell>{num(d.emptyBags50kg.indonesia.plant01)}</Cell>
              <Cell>{num(d.emptyBags50kg.indonesia.plant02)}</Cell>
              <Cell>{num(d.emptyBags50kg.indonesia.plant03)}</Cell>
              <Cell>{num(d.emptyBags50kg.indonesia.gStore)}</Cell>
              <Cell bold>{num(t.indonesiaTotal)}</Cell>
            </tr>
          </tbody>
        </DocTable>
      </div>

      {/* Row 4 — Empty Jumbo Bags (full width) */}
      <div className="mt-4">
        <DocTable>
          <thead>
            <TitleBar span={5}>EMPTY JUMBO BAGS STOCK</TitleBar>
            <ColumnHeaders
              color={C.blue}
              cols={[
                { label: "Location", width: "24%" },
                { label: "Cement Godown", width: "19%" },
                { label: "Cement Jetty", width: "19%" },
                { label: "G-Store", width: "19%" },
                { label: "Total", width: "19%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Quantity (Nos)</Cell>
              <Cell>{num(d.emptyJumbo.cementGodown)}</Cell>
              <Cell>{d.emptyJumbo.cementJetty === 0 ? "-" : num(d.emptyJumbo.cementJetty)}</Cell>
              <Cell>{num(d.emptyJumbo.gStore)}</Cell>
              <Cell bold>{num(t.totalEmptyJumbo)}</Cell>
            </tr>
          </tbody>
        </DocTable>
      </div>

      {/* Row 5 — Net Slings (full width) */}
      <div className="mt-4">
        <DocTable>
          <thead>
            <TitleBar span={5}>NET SLINGS STOCK</TitleBar>
            <ColumnHeaders
              color={C.blue}
              cols={[
                { label: "Location", width: "18%" },
                { label: "Category", width: "22%" },
                { label: "Cement Godown", width: "20%" },
                { label: "G-Store", width: "20%" },
                { label: "Total", width: "20%" },
              ]}
            />
          </thead>
          <tbody>
            <tr>
              <Cell>Quantity (Nos)</Cell>
              <Cell>New Net Sling</Cell>
              <Cell>{num(d.netSlings.new.cementGodown)}</Cell>
              <Cell>{num(d.netSlings.new.gStore)}</Cell>
              <Cell bold>{num(t.newSlingTotal)}</Cell>
            </tr>
            <tr>
              <Cell>Quantity (Nos)</Cell>
              <Cell>Used Net Sling</Cell>
              <Cell>{num(d.netSlings.used.cementGodown)}</Cell>
              <Cell>{num(d.netSlings.used.gStore)}</Cell>
              <Cell bold>{num(t.usedSlingTotal)}</Cell>
            </tr>
          </tbody>
        </DocTable>
      </div>

      {d.notes && d.notes.trim() ? (
        <div className="mt-4 text-[12px]">
          <span className="font-bold" style={{ color: C.navy }}>
            Remarks:{" "}
          </span>
          <span className="whitespace-pre-wrap text-slate-700">{d.notes}</span>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-t pt-2 text-[10.5px] text-slate-500" style={{ borderColor: C.border }}>
        <span>{settings.pdfFooter}</span>
        <span>Prepared by {report.createdByName}</span>
      </div>
    </div>
  );
}
