import { TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inspectEnvReadiness } from "@/lib/env";
import { repairPlaceholderSummariesAction, runHistoricalBackfillAction, sendTestEmailAction } from "./actions";

type TestingPageProps = {
  searchParams: Promise<{
    status?: string;
    mode?: string;
    videos?: string;
    weekly?: string;
    summarized?: string;
    skipped?: string;
    email?: string;
    message?: string;
    repair?: string;
    checked?: string;
    repaired?: string;
    placeholder?: string;
    failed?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function TestingPage({ searchParams }: TestingPageProps) {
  const params = await searchParams;
  const readiness = inspectEnvReadiness();
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartDate = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  const disabled = !readiness.serverReady;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Historical testing</p>
          <h1>Testing</h1>
          <p>Run FishBot against a past upload date range without waiting for the weekly cron schedule.</p>
        </div>
      </div>

      {!readiness.serverReady ? (
        <div className="notice">Configure required server environment variables first: {readiness.serverMissing.join(", ")}</div>
      ) : null}
      {params.status === "done" ? (
        <div className="notice">
          {params.mode === "dry" ? "Dry run complete" : "Backfill complete"}: checked {params.videos ?? "0"} upload(s), found {params.weekly ?? "0"} weekly report(s),
          summarized {params.summarized ?? "0"}, skipped {params.skipped ?? "0"} existing.
        </div>
      ) : null}
      {params.email === "sent" ? <div className="notice">Test email sent. Check your inbox and spam folder.</div> : null}
      {params.email === "skipped" ? <div className="notice">Email is disabled. Set ENABLE_EMAIL=true and redeploy.</div> : null}
      {params.email === "failed" ? <div className="notice">Test email failed: {params.message ?? "Gmail SMTP returned an error."}</div> : null}
      {params.repair === "done" ? (
        <div className="notice">
          Placeholder repair complete: checked {params.checked ?? "0"} weekly report(s), repaired {params.repaired ?? "0"}, still placeholder {params.placeholder ?? "0"},
          failed {params.failed ?? "0"}.{params.message ? ` Last error: ${params.message}` : ""}
        </div>
      ) : null}

      <div className="detail-grid">
        <Card title="Date Range Backfill" eyebrow="No email is sent">
          <form action={runHistoricalBackfillAction} className="form-grid">
            <label>
              Start date
              <input type="date" name="startDate" defaultValue={defaultStartDate} required />
            </label>
            <label>
              End date
              <input type="date" name="endDate" defaultValue={defaultEnd} required />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" name="dryRun" defaultChecked />
              Dry run only
            </label>
            <Button type="submit" disabled={disabled} title={disabled ? "Configure server environment first" : "Run historical summarization test"}>
              <TestTube2 size={16} />
              Run test
            </Button>
          </form>
        </Card>

        <Card title="What This Does">
          <ul className="summary-list">
            <li>Fetches channel uploads published inside the selected date range.</li>
            <li>Classifies every upload as weekly report, possible report, extra upload, or ignored.</li>
            <li>Only summarizes high-confidence weekly reports.</li>
            <li>Does not send email during historical testing.</li>
            <li>Dry run previews the classification count without storing summaries.</li>
          </ul>
        </Card>

        <Card title="Email Test" eyebrow="Gmail SMTP">
          <form action={sendTestEmailAction} className="form-grid">
            <p className="muted">Sends one test email to the configured recipient and records the result in Email Deliveries.</p>
            <Button type="submit" disabled={disabled} title={disabled ? "Configure server environment first" : "Send a Gmail SMTP test email"}>
              Send test email
            </Button>
          </form>
        </Card>

        <Card title="Repair Placeholder Reports" eyebrow="Transcript retry">
          <form action={repairPlaceholderSummariesAction} className="form-grid">
            <p className="muted">
              Retries up to five high-confidence weekly reports currently marked placeholder and replaces them with real summaries when transcripts are available.
            </p>
            <Button type="submit" disabled={disabled} title={disabled ? "Configure server environment first" : "Retry transcript fetching and summarization"}>
              Repair placeholders
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
