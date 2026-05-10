import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SummaryViewer } from "@/components/reports/SummaryViewer";
import { formatDateTime } from "@/lib/formatters";
import { getReportByVideoId } from "@/lib/supabase/queries";
import { ignoreVideoAction, summarizeVideoAction, summarizeWithManualTranscriptAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportDetailPageProps = {
  params: Promise<{
    videoId: string;
  }>;
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const { videoId } = await params;
  const report = await getReportByVideoId(videoId);
  if (!report) notFound();

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
          {report.transcript_status === "placeholder" ? (
            <p className="muted">
              This is a fallback summary because automated caption download did not return usable transcript text. Paste the
              YouTube transcript below to generate the real report.
            </p>
          ) : null}
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
          </dl>
        </Card>
        <Card title="Paste Transcript">
          <form action={summarizeWithManualTranscriptAction.bind(null, report.youtube_video_id)} className="form-grid">
            <label>
              Transcript text
              <textarea
                name="transcript"
                placeholder="Paste the YouTube transcript here, then summarize."
                required
                rows={10}
              />
            </label>
            <button className="button button-primary" type="submit">
              Summarize pasted transcript
            </button>
          </form>
          <p className="muted">Use this when YouTube shows a transcript in the browser but blocks automated caption download.</p>
        </Card>
        <Card title="Email Digest Text">
          <pre className="digest-preview">{report.summary?.digest_text ?? "Email digest has not been rendered yet."}</pre>
        </Card>
      </section>
    </div>
  );
}
