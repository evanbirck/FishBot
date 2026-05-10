import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SummaryViewer } from "@/components/reports/SummaryViewer";
import { formatDateTime } from "@/lib/formatters";
import { getReportByVideoId } from "@/lib/supabase/queries";
import { ignoreVideoAction, summarizeVideoAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportDetailPageProps = {
  params: {
    videoId: string;
  };
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const report = await getReportByVideoId(params.videoId);
  if (!report) notFound();
  const smsMessageCount = report.summary?.sms_text ? report.summary.sms_text.split(/\n\n+/).filter(Boolean).length : 0;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{formatDateTime(report.published_at)}</p>
          <h1>{report.title}</h1>
          <p>Report score {report.report_score}, transcript {report.transcript_status}.</p>
        </div>
        <ButtonLink href={report.video_url} target="_blank">
          YouTube <ExternalLink size={16} />
        </ButtonLink>
      </div>

      <section className="detail-grid">
        <Card title="Summary" action={<Badge tone={statusTone(report.transcript_status)}>{report.transcript_status}</Badge>}>
          {report.summary ? <SummaryViewer summary={report.summary.summary_json_typed} /> : <p className="muted">Summary pending.</p>}
        </Card>
        <Card title="Manual Actions">
          <div className="button-row">
            <form action={summarizeVideoAction.bind(null, report.youtube_video_id)}>
              <button className="button button-primary" type="submit">
                Summarize this video
              </button>
            </form>
            <form action={ignoreVideoAction.bind(null, report.youtube_video_id)}>
              <button className="button button-secondary" type="submit">
                Ignore this video
              </button>
            </form>
          </div>
          <dl className="settings-list">
            <div>
              <dt>Classification</dt>
              <dd>{report.classification}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{report.classification_confidence}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{report.classification_reason ?? "No reason recorded"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{report.user_approval_status}</dd>
            </div>
            <div>
              <dt>SMS messages</dt>
              <dd>{smsMessageCount}</dd>
            </div>
          </dl>
        </Card>
        <Card title="SMS Text">
          <pre className="sms-preview">{report.summary?.sms_text ?? "SMS has not been rendered yet."}</pre>
        </Card>
      </section>
    </div>
  );
}
