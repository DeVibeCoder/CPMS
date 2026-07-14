import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Database,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useSettings } from "@/store/settings";
import { useTheme, type ThemeMode } from "@/store/theme";
import { repo } from "@/data";
import type { CompanySettings } from "@/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const { mode, setMode } = useTheme();
  const [form, setForm] = useState<CompanySettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  usePageMeta("Settings", "Configure application preferences.");

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = (patch: Partial<CompanySettings>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 400_000) {
      toast({
        variant: "destructive",
        title: "Logo too large",
        description: "Please use an image under 400 KB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save(form);
      toast({ variant: "success", title: "Settings saved" });
    } finally {
      setSaving(false);
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
      <div className="mb-5 flex items-center justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Company */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Company
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input
                value={form.companyName}
                onChange={(e) => update({ companyName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {form.logoDataUrl ? (
                    <img
                      src={form.logoDataUrl}
                      alt="Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogo(e.target.files?.[0])}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Upload
                  </Button>
                  {form.logoDataUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ logoDataUrl: undefined })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bag Weight (MT per 50KG bag)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.bagWeightMt}
                onChange={(e) =>
                  update({ bagWeightMt: Number(e.target.value) || 0 })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* PDF Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> PDF & Report Branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Report Title</Label>
              <Input
                value={form.reportTitle}
                onChange={(e) => update({ reportTitle: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>PDF Header</Label>
              <Input
                value={form.pdfHeader}
                onChange={(e) => update({ pdfHeader: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>PDF Footer</Label>
              <Textarea
                rows={2}
                value={form.pdfFooter}
                onChange={(e) => update({ pdfFooter: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

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

        {/* Data / Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Data & Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export the full database as JSON, restore from a backup, or reset
              to seed data.
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
                <RotateCcw className="h-4 w-4" /> Reset to Seed
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset database?"
        description="This will erase all current reports, users and settings and restore the demo seed data. This cannot be undone."
        destructive
        confirmLabel="Reset Everything"
        loading={resetting}
        onConfirm={onReset}
      />
    </div>
  );
}
