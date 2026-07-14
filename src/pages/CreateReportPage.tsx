import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Layers,
  Loader2,
  PackageOpen,
  Save,
  Container,
  Link2,
} from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "@/components/report/NumberField";
import { computeTotals, emptyReportData } from "@/lib/calculations";
import { cn, formatNumber } from "@/lib/utils";
import type { ReportData, ReportStatus } from "@/types";
import { repo } from "@/data";
import { useAuth } from "@/store/auth";
import { toast } from "@/hooks/use-toast";

function TotalRow({
  label,
  value,
  decimals,
  unit,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-primary/8 px-3 py-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums text-primary">
        {formatNumber(value, decimals !== undefined ? { decimals } : {})}
        {unit ? <span className="ml-1 text-xs font-medium">{unit}</span> : null}
      </span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  index,
  title,
  children,
}: {
  icon: typeof Boxes;
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            SECTION {index}
          </span>
          <span className="text-[15px]">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export default function CreateReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const isEdit = Boolean(id);

  const [data, setData] = useState<ReportData>(emptyReportData());
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<ReportStatus>("final");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [sourceCreatedBy, setSourceCreatedBy] = useState<{
    id: string;
    name: string;
  } | null>(null);
  /** Mobile-only: index of the section shown one-at-a-time. */
  const [step, setStep] = useState(0);

  usePageMeta(
    isEdit ? "Edit Report" : "Create Report",
    isEdit
      ? "Update daily stock figures — totals recalculate automatically."
      : "Enter today's stock figures — all totals are calculated for you.",
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    repo.getReport(id).then((r) => {
      if (r) {
        setData(r.data);
        setDate(r.date);
        setStatus(r.status);
        setSourceCreatedBy({ id: r.createdBy, name: r.createdByName });
      } else {
        toast({ variant: "destructive", title: "Report not found." });
        navigate("/reports");
      }
      setLoading(false);
    });
  }, [id, navigate]);

  const totals = useMemo(() => computeTotals(data), [data]);

  // ---- Immutable nested updaters ----
  const set50 = (k: keyof ReportData["bags50kg"], v: number) =>
    setData((d) => ({ ...d, bags50kg: { ...d.bags50kg, [k]: v } }));
  const setSilo = (k: keyof ReportData["silo"], v: number) =>
    setData((d) => ({ ...d, silo: { ...d.silo, [k]: v } }));
  const setChina = (k: keyof ReportData["emptyBags50kg"]["china"], v: number) =>
    setData((d) => ({
      ...d,
      emptyBags50kg: {
        ...d.emptyBags50kg,
        china: { ...d.emptyBags50kg.china, [k]: v },
      },
    }));
  const setIndo = (
    k: keyof ReportData["emptyBags50kg"]["indonesia"],
    v: number,
  ) =>
    setData((d) => ({
      ...d,
      emptyBags50kg: {
        ...d.emptyBags50kg,
        indonesia: { ...d.emptyBags50kg.indonesia, [k]: v },
      },
    }));
  const setEmptyJumbo = (k: keyof ReportData["emptyJumbo"], v: number) =>
    setData((d) => ({ ...d, emptyJumbo: { ...d.emptyJumbo, [k]: v } }));
  const setSlingNew = (k: keyof ReportData["netSlings"]["new"], v: number) =>
    setData((d) => ({
      ...d,
      netSlings: { ...d.netSlings, new: { ...d.netSlings.new, [k]: v } },
    }));
  const setSlingUsed = (k: keyof ReportData["netSlings"]["used"], v: number) =>
    setData((d) => ({
      ...d,
      netSlings: { ...d.netSlings, used: { ...d.netSlings.used, [k]: v } },
    }));

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (isEdit && id) {
        await repo.updateReport(id, {
          date,
          status,
          data,
          updatedByName: user.name,
        });
        toast({
          variant: "success",
          title: "Report updated",
          description: `Stock report for ${format(new Date(date), "dd MMM yyyy")} saved.`,
        });
      } else {
        const existing = await repo.getReportByDate(date);
        if (existing) {
          toast({
            variant: "destructive",
            title: "A report already exists for this date",
            description: "Edit the existing report or choose another date.",
          });
          setSaving(false);
          return;
        }
        await repo.createReport({
          date,
          status,
          data,
          createdBy: user.id,
          createdByName: user.name,
          updatedByName: user.name,
        });
        toast({
          variant: "success",
          title: "Report saved",
          description: `Stock report for ${format(new Date(date), "dd MMM yyyy")} created.`,
        });
      }
      navigate("/reports");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save report",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Each section is defined once and rendered in both the desktop grid and the
  // mobile step-through wizard.
  const sec1 = (
    <SectionCard icon={Boxes} index={1} title="50KG Bags Stock">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label="Cement Jetty"
          value={data.bags50kg.cementJetty}
          onChange={(v) => set50("cementJetty", v)}
        />
        <NumberField
          label="Godown"
          value={data.bags50kg.godown}
          onChange={(v) => set50("godown", v)}
        />
        <NumberField
          label="Q-Marine Jetty"
          value={data.bags50kg.qMarineJetty}
          onChange={(v) => set50("qMarineJetty", v)}
        />
      </div>
      <TotalRow label="Total Cement" value={totals.total50kgBags} unit="Bags" />
    </SectionCard>
  );

  const sec2 = (
    <SectionCard icon={Layers} index={2} title="Jumbo Bags Stock">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberField
          label="Cement Jetty (Jumbo Bags)"
          value={data.jumbo.cementJetty}
          onChange={(v) =>
            setData((d) => ({ ...d, jumbo: { ...d.jumbo, cementJetty: v } }))
          }
        />
        <NumberField
          label="Total Cement (MT)"
          value={data.jumbo.totalCementMt}
          allowDecimals
          unit="MT"
          onChange={(v) =>
            setData((d) => ({ ...d, jumbo: { ...d.jumbo, totalCementMt: v } }))
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Total Cement (MT) is entered directly, as on the master report.
      </p>
    </SectionCard>
  );

  const sec3 = (
    <SectionCard icon={Container} index={3} title="Silo Balance">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label="Current Stock"
          value={data.silo.currentStock}
          onChange={(v) => setSilo("currentStock", v)}
          allowDecimals
          unit="MT"
        />
        <NumberField
          label="Sales"
          value={data.silo.sales}
          onChange={(v) => setSilo("sales", v)}
          allowDecimals
          unit="MT"
        />
        <NumberField
          label="Production"
          value={data.silo.production}
          onChange={(v) => setSilo("production", v)}
          allowDecimals
          unit="MT"
        />
      </div>
    </SectionCard>
  );

  const sec4 = (
    <SectionCard icon={ClipboardList} index={4} title="50KG Empty Bags Stock">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* China */}
        <div className="space-y-3">
          <Badge variant="secondary">China Bags</Badge>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Plant 01"
              value={data.emptyBags50kg.china.plant01}
              onChange={(v) => setChina("plant01", v)}
            />
            <NumberField
              label="Plant 02"
              value={data.emptyBags50kg.china.plant02}
              onChange={(v) => setChina("plant02", v)}
            />
            <NumberField
              label="Plant 03"
              value={data.emptyBags50kg.china.plant03}
              onChange={(v) => setChina("plant03", v)}
            />
            <NumberField
              label="G Store"
              value={data.emptyBags50kg.china.gStore}
              onChange={(v) => setChina("gStore", v)}
            />
          </div>
          <TotalRow label="China Total" value={totals.chinaTotal} />
        </div>
        {/* Indonesia */}
        <div className="space-y-3">
          <Badge variant="secondary">Indonesia Bags</Badge>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Plant 01"
              value={data.emptyBags50kg.indonesia.plant01}
              onChange={(v) => setIndo("plant01", v)}
            />
            <NumberField
              label="Plant 02"
              value={data.emptyBags50kg.indonesia.plant02}
              onChange={(v) => setIndo("plant02", v)}
            />
            <NumberField
              label="Plant 03"
              value={data.emptyBags50kg.indonesia.plant03}
              onChange={(v) => setIndo("plant03", v)}
            />
            <NumberField
              label="G Store"
              value={data.emptyBags50kg.indonesia.gStore}
              onChange={(v) => setIndo("gStore", v)}
            />
          </div>
          <TotalRow label="Indonesia Total" value={totals.indonesiaTotal} />
        </div>
      </div>
      <div className="mt-4">
        <TotalRow
          label="Total Empty Bags (China + Indonesia)"
          value={totals.totalEmptyBags}
        />
      </div>
    </SectionCard>
  );

  const sec5 = (
    <SectionCard icon={PackageOpen} index={5} title="Empty Jumbo Bags">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label="Cement Godown"
          value={data.emptyJumbo.cementGodown}
          onChange={(v) => setEmptyJumbo("cementGodown", v)}
        />
        <NumberField
          label="Cement Jetty"
          value={data.emptyJumbo.cementJetty}
          onChange={(v) => setEmptyJumbo("cementJetty", v)}
        />
        <NumberField
          label="G Store"
          value={data.emptyJumbo.gStore}
          onChange={(v) => setEmptyJumbo("gStore", v)}
        />
      </div>
      <TotalRow label="Total Empty Jumbo" value={totals.totalEmptyJumbo} />
    </SectionCard>
  );

  const sec6 = (
    <SectionCard icon={Link2} index={6} title="Net Slings">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Badge variant="secondary">New Net Sling</Badge>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Cement Godown"
              value={data.netSlings.new.cementGodown}
              onChange={(v) => setSlingNew("cementGodown", v)}
            />
            <NumberField
              label="G Store"
              value={data.netSlings.new.gStore}
              onChange={(v) => setSlingNew("gStore", v)}
            />
          </div>
          <TotalRow label="New Total" value={totals.newSlingTotal} />
        </div>
        <div className="space-y-3">
          <Badge variant="secondary">Used Net Sling</Badge>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Cement Godown"
              value={data.netSlings.used.cementGodown}
              onChange={(v) => setSlingUsed("cementGodown", v)}
            />
            <NumberField
              label="G Store"
              value={data.netSlings.used.gStore}
              onChange={(v) => setSlingUsed("gStore", v)}
            />
          </div>
          <TotalRow label="Used Total" value={totals.usedSlingTotal} />
        </div>
      </div>
    </SectionCard>
  );

  const sec7 = (
    <SectionCard icon={ClipboardList} index={7} title="Remarks (optional)">
      <Textarea
        placeholder="Any notes for this report…"
        value={data.notes ?? ""}
        onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
        rows={4}
      />
    </SectionCard>
  );

  const sections: { title: string; node: React.ReactNode }[] = [
    { title: "50KG Bags Stock", node: sec1 },
    { title: "Jumbo Bags Stock", node: sec2 },
    { title: "Silo Balance", node: sec3 },
    { title: "50KG Empty Bags Stock", node: sec4 },
    { title: "Empty Jumbo Bags", node: sec5 },
    { title: "Net Slings", node: sec6 },
    { title: "Remarks", node: sec7 },
  ];
  const activeStep = Math.min(step, sections.length - 1);

  return (
    <div className="pb-20 md:pb-0">
      {/* Top actions */}
      <div className="mb-5 flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onSave}
          disabled={saving}
          className="hidden md:inline-flex"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEdit ? "Save Changes" : "Save Report"}
        </Button>
      </div>

      {/* Meta bar */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="date">Report Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-1.5">
              {(["final", "draft"] as ReportStatus[]).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={status === s ? "default" : "outline"}
                  size="sm"
                  className="capitalize"
                  onClick={() => setStatus(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          {isEdit && sourceCreatedBy && (
            <div className="sm:ml-auto">
              <Badge variant="secondary">
                Originally created by {sourceCreatedBy.name}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desktop / tablet: full grid */}
      <div className="hidden grid-cols-1 gap-5 md:grid md:grid-cols-2">
        {sec1}
        {sec2}
        {sec3}
        {sec5}
        <div className="md:col-span-2">{sec4}</div>
        {sec6}
        {sec7}
      </div>

      {/* Mobile: one section at a time */}
      <div className="md:hidden">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Section {activeStep + 1} of {sections.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {sections[activeStep].title}
          </span>
        </div>
        <div className="mb-4 flex gap-1">
          {sections.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= activeStep ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
        {sections[activeStep].node}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={activeStep === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {activeStep < sections.length - 1 ? (
            <Button
              className="flex-1"
              onClick={() =>
                setStep((s) => Math.min(sections.length - 1, s + 1))
              }
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEdit ? "Save" : "Save Report"}
            </Button>
          )}
        </div>
      </div>

      {/* Sticky save bar (desktop / tablet — mobile uses the wizard nav) */}
      <div className="sticky bottom-4 z-10 mt-6 hidden items-center justify-between rounded-xl border border-border bg-card/95 px-5 py-3 shadow-elevated backdrop-blur md:flex">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Total Cement:{" "}
            <span className="font-bold text-foreground">
              {formatNumber(totals.totalCementMt, { decimals: 2 })} MT
            </span>
          </span>
          <span className="text-muted-foreground">
            Empty Bags:{" "}
            <span className="font-bold text-foreground">
              {formatNumber(totals.totalEmptyBags)}
            </span>
          </span>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEdit ? "Save Changes" : "Save Report"}
        </Button>
      </div>
    </div>
  );
}
