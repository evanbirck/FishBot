import { ExternalLink } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/formatters";
import type { ReportWithSummary } from "@/lib/supabase/queries";

type LatestReportCardProps = {
  report: ReportWithSummary | null;
};

export function LatestReportCard({ report }: LatestReportCardProps) {
  if (!report) {
    return (
      <Card title="Latest Report">
        <EmptyState
          title="No reports yet"
          description="Once the cron job or manual run processes a video, the latest summary appears here."
        />
      </Card>
    );
  }

  const summary = report.summary?.summary_json_typed;

  return (
    <Card
      title="Latest Report"
      eyebrow={formatDate(report.published_at)}
      action={<Badge tone={statusTone(report.transcript_status)}>{report.transcript_status}</Badge>}
    >
      <div className="latest-report">
        <h3>{summary?.headline ?? report.title}</h3>
        {summary ? (
          <ul className="summary-list">
            {[
              summary.biteStatus,
              summary.areas.length ? `Areas: ${summary.areas.join(", ")}` : "",
              summary.tideCurrent.length ? `Current/tide: ${summary.tideCurrent.join(", ")}` : "",
              summary.baits.length ? `Baits: ${summary.baits.join(", ")}` : "",
              summary.gamePlan.length ? `Game plan: ${summary.gamePlan.join("; ")}` : ""
            ].filter(Boolean).map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Summary has not been generated yet.</p>
        )}
        <div className="button-row">
          <ButtonLink href={`/reports/${report.youtube_video_id}`} variant="secondary">
            View report
          </ButtonLink>
          <ButtonLink href={report.video_url} variant="ghost" target="_blank">
            YouTube <ExternalLink size={15} />
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
