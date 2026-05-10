import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/formatters";
import type { ReportWithSummary } from "@/lib/supabase/queries";

type VideoClassificationTableProps = {
  reports: ReportWithSummary[];
};

export function VideoClassificationTable({ reports }: VideoClassificationTableProps) {
  if (!reports.length) {
    return <EmptyState title="No classified videos" description="Recent uploads will appear here after the pipeline runs." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Published</th>
            <th>Classification</th>
            <th>Confidence</th>
            <th>Action</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td>
                <a href={report.video_url} target="_blank">
                  {report.title}
                </a>
              </td>
              <td>{formatDateTime(report.published_at)}</td>
              <td>
                <Badge tone={statusTone(report.classification === "weekly_report" ? "succeeded" : report.classification === "ignored" ? "failed" : "skipped")}>
                  {report.classification}
                </Badge>
              </td>
              <td>{report.classification_confidence}</td>
              <td>{report.recommended_action}</td>
              <td>{report.classification_reason ?? "No reason recorded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
