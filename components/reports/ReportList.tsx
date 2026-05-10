import { EmptyState } from "@/components/ui/EmptyState";
import type { ReportWithSummary } from "@/lib/supabase/queries";
import { ReportCard } from "@/components/reports/ReportCard";

type ReportListProps = {
  reports: ReportWithSummary[];
};

export function ReportList({ reports }: ReportListProps) {
  if (!reports.length) {
    return <EmptyState title="No reports found" description="Run the pipeline to discover and summarize the latest channel uploads." />;
  }

  return (
    <div className="report-grid">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
