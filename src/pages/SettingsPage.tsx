import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDownToLine,
  Database,
  Download,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/report/NumberField";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useTheme, type ThemeMode } from "@/store/theme";
import { useSettings } from "@/store/settings";
import { repo } from "@/data";
import { APP_LONG_NAME, APP_NAME, ORG_NAME } from "@/config/brand";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ---- Cement opening balance ----
  // Lives here rather than on the Inventory page: it is the one stock figure
  // entered by hand, it is set once at go-live, and only an administrator may
  // change it. On the ledger itself it was a permanent banner above the data
  // for a control almost nobody would ever press.
  const settings = useSettings((s) => s.settings);
  const loadSettings = useSettings((s) => s.load);
  const saveSettings = useSettings((s) => s.save);
  const [anchorBalance, setAnchorBalance] = useState(0);
  const [anchorDate, setAnchorDate] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const configured = settings?.cementOpeningDate !== undefined;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Seed the fields once settings arrive, and again whenever they change under
  // us (another tab, a restored backup) — but never while an edit is in flight.
  useEffect(() => {
    if (!settings) return;
    setAnchorBalance(settings.cementOpeningBalance ?? 0);
    setAnchorDate(settings.cementOpeningDate ?? format(new Date(), "yyyy-MM-01"));
  }, [settings]);

  const onSaveAnchor = async () => {
    if (!anchorDate) {
      toast({ variant: "destructive", title: "Choose a start date." });
      return;
    }
    setSavingAnchor(true);
    try {
      await saveSettings({
        cementOpeningBalance: anchorBalance,
        cementOpeningDate: anchorDate,
      });
      toast({
        variant: "success",
        title: "Opening balance saved",
        description: "The cement bin card has been recalculated.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save the opening balance",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSavingAnchor(false);
    }
  };

  const onExport = async () => {
    const db = await repo.exportDatabase();
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cpsm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ variant: "success", title: "Backup downloaded" });
  };

  const onImport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const db = JSON.parse(reader.result as string);
        await repo.importDatabase(db);
        toast({
          variant: "success",
          title: "Backup restored",
          description: "Reloading…",
        });
        setTimeout(() => window.location.reload(), 800);
      } catch {
        toast({ variant: "destructive", title: "Invalid backup file" });
      }
    };
    reader.readAsText(file);
  };

  const onReset = async () => {
    setResetting(true);
    await repo.resetDatabase();
    toast({ variant: "success", title: "Database reset", description: "Reloading…" });
    setTimeout(() => window.location.reload(), 800);
  };

  const themes: { key: ThemeMode; label: string }[] = [
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "system", label: "System" },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="mb-2 block">Theme</Label>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setMode(t.key)}
                  className={cn(
                    "rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors",
                    mode === t.key
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cement opening balance — the bin-card anchor. */}
        <Card className={configured ? undefined : "border-l-4 border-l-primary"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-primary" /> Cement Opening
              Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The cement in the silos on your first day. This is the only stock
              figure entered by hand — every balance after it is carried forward
              automatically from finalised reports and logged shipments.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>
            <p className="text-xs text-muted-foreground">
              Reports and shipments dated before the start date are left out of
              the bin card. Changing either figure recalculates every row.
            </p>
            <Button onClick={onSaveAnchor} disabled={savingAnchor}>
              {savingAnchor && <Loader2 className="h-4 w-4 animate-spin" />}
              {configured ? "Save Opening Balance" : "Set Opening Balance"}
            </Button>
          </CardContent>
        </Card>

        {/* Data / Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Data & Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export reports, settings and the user list as JSON, restore
              reports and settings from a backup, or clear all report data.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4" /> Export Backup
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => onImport(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Restore Backup
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw className="h-4 w-4" /> Reset Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About — read-only identity.
            Company name and PDF branding used to be editable here. They are
            fixed values now, shown so an administrator can still confirm what
            the printed reports will say. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {[
              ["Application", `${APP_NAME} — ${APP_LONG_NAME}`],
              ["Organisation", ORG_NAME],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-border pb-2.5 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset database?"
        description="This permanently deletes every report and restores the default settings. User accounts are not affected. This cannot be undone."
        destructive
        confirmLabel="Delete All Reports"
        loading={resetting}
        onConfirm={onReset}
      />
    </div>
  );
}
