import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Download, Loader2, Pencil, Printer } from "lucide-react";
import { usePageMeta } from "@/store/pageMeta";
import { Button } from "@/components/ui/button";
import { ReportDocument } from "@/components/report/ReportDocument";
import { repo } from "@/data";
import { useSettings } from "@/store/settings";
import { useAuth, can } from "@/store/auth";
import type { Report } from "@/types";
import { downloadReportPdf, printReportPdf } from "@/lib/pdf";
import { toast } from "@/hooks/use-toast";

export default function ViewReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useSettings((s) => s.settings);
  const role = useAuth((s) => s.user?.role);
  const canEdit = can(role, "editReports");
  const canExport = can(role, "exportPdf");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  usePageMeta(
    report
      ? `Report — ${format(parseISO(report.date), "dd MMM yyyy")}`
      : "Report",
    report ? `Created by ${report.createdByName}` : "View stock report.",
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    repo.getReport(id).then((r) => {
      if (!r) {
        toast({ variant: "destructive", title: "Report not found." });
        navigate("/reports");
        return;
      }
      setReport(r);
      setLoading(false);
    });
  }, [id, navigate]);

  if (loading || !report || !settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Actions toolbar */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => navigate("/reports")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => navigate(`/reports/${report.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {/* Print / Download live in the sticky bar on mobile */}
          {canExport && (
            <>
              <Button
                variant="outline"
                className="hidden sm:inline-flex"
                onClick={() => printReportPdf(report, settings)}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button
                className="hidden sm:inline-flex"
                onClick={() => downloadReportPdf(report, settings)}
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-6">
        <ReportDocument report={report} settings={settings} />
      </div>

      {/* Sticky mobile action bar */}
      {canExport && (
        <div className="no-print fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-border bg-card/95 p-3 backdrop-blur sm:hidden">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => printReportPdf(report, settings)}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            className="flex-1"
            onClick={() => downloadReportPdf(report, settings)}
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      )}
    </div>
  );
}
