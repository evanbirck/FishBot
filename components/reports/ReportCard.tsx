import { ExternalLink } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/formatters";
import type { ReportWithSummary } from "@/lib/supabase/queries";

type ReportCardProps = {
  report: ReportWithSummary;
};

export function ReportCard({ report }: ReportCardProps) {
  const summary = report.summary?.summary_json_typed;

  return (
    <Card
      title={summary?.headline ?? report.title}
      eyebrow={formatDate(report.published_at)}
      action={<Badge tone={statusTone(report.transcript_status)}>{report.transcript_status}</Badge>}
    >
      <p className="muted">{report.title}</p>
      {summary ? <p>{summary.biteStatus ?? summary.headline}</p> : <p>Summary pending.</p>}
      <div className="button-row">
        <ButtonLink href={`/reports/${report.youtube_video_id}`} variant="secondary">
          Details
        </ButtonLink>
        <ButtonLink href={report.video_url} variant="ghost" target="_blank">
          YouTube <ExternalLink size={15} />
        </ButtonLink>
      </div>
    </Card>
  );
}
