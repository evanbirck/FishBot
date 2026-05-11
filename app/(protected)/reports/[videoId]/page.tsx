import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SummaryViewer } from "@/components/reports/SummaryViewer";
import { formatDateTime } from "@/lib/formatters";
import { getReportByVideoId } from "@/lib/supabase/queries";
import { emailReportAction, ignoreVideoAction, summarizeVideoAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportDetailPageProps = {
  params: Promise<{
    videoId: string;
  }>;
  searchParams: Promise<{
    summary?: string;
    email?: string;
    message?: string;
  }>;
};

export default async function ReportDetailPage({ params, searchParams }: ReportDetailPageProps) {
  const { videoId } = await params;
  const notice = await searchParams;
  const report = await getReportByVideoId(videoId);
  if (!report) notFound();
  const isPlaceholderSummary = report.summary?.model === "placeholder";
  const displayedStatus = isPlaceholderSummary ? "needs_summary" : report.user_approval_status;

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

      {notice.summary === "done" ? <div className="notice">Summary generated.</div> : null}
      {notice.summary === "placeholder" ? (
        <div className="notice">Transcript still was not available, so FishBot kept the fallback placeholder.</div>
      ) : null}
      {notice.summary === "missing" ? (
        <div className="notice">No public transcript or captions were available, so FishBot did not generate a summary.</div>
      ) : null}
      {notice.summary === "failed" ? <div className="notice">Summary failed: {notice.message ?? "OpenAI or transcript processing returned an error."}</div> : null}
      {notice.email === "sent" ? <div className="notice">Report email sent.</div> : null}
      {notice.email === "skipped" ? <div className="notice">Email is disabled. Set ENABLE_EMAIL=true and redeploy.</div> : null}
      {notice.email === "failed" ? <div className="notice">Report email failed: {notice.message ?? "Gmail SMTP returned an error."}</div> : null}

      <section className="detail-grid">
        <Card title="Summary" action={<Badge tone={statusTone(report.transcript_status)}>{report.transcript_status}</Badge>}>
          {report.summary && !isPlaceholderSummary ? (
            <SummaryViewer summary={report.summary.summary_json_typed} />
          ) : (
            <p className="muted">
              No real summary has been generated yet. FishBot needs a usable public transcript before it can summarize this video.
            </p>
          )}
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
            <form action={emailReportAction.bind(null, report.youtube_video_id)}>
              <button className="button button-secondary" type="submit" disabled={isPlaceholderSummary || !report.summary}>
                Email this report
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
              <dd>{displayedStatus}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Email Preview">
          <pre className="digest-preview">
            {report.summary && !isPlaceholderSummary ? report.summary.digest_text : "Email preview appears after a real summary is generated."}
          </pre>
        </Card>
      </section>
    </div>
  );
}
