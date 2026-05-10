import { TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inspectEnvReadiness } from "@/lib/env";
import { runHistoricalBackfillAction } from "./actions";

type TestingPageProps = {
  searchParams: Promise<{
    status?: string;
    mode?: string;
    videos?: string;
    weekly?: string;
    summarized?: string;
    skipped?: string;
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

      <div className="detail-grid">
        <Card title="Date Range Backfill" eyebrow="No SMS is sent">
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
            <li>Does not send SMS during historical testing.</li>
            <li>Dry run previews the classification count without storing summaries.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
