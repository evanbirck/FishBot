import { Play } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { LatestReportCard } from "@/components/dashboard/LatestReportCard";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import { SmsDeliveriesTable } from "@/components/dashboard/SmsDeliveriesTable";
import { VideoClassificationTable } from "@/components/dashboard/VideoClassificationTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inspectEnvReadiness } from "@/lib/env";
import { getDashboardData } from "@/lib/supabase/queries";
import { triggerManualRunAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const readiness = inspectEnvReadiness();
  const manualDisabled = process.env.NODE_ENV === "production" || !readiness.serverReady;
  const manualRunTitle =
    process.env.NODE_ENV === "production"
      ? "Manual runs are disabled in production"
      : readiness.serverReady
        ? "Run the report pipeline now"
        : `Configure required server environment variables first: ${readiness.serverMissing.join(", ")}`;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Dashboard</h1>
          <p>Latest report, cron history, transcript status, recipients, and Twilio delivery state.</p>
        </div>
        <form action={triggerManualRunAction}>
          <Button type="submit" disabled={manualDisabled} title={manualRunTitle}>
            <Play size={16} />
            Run now
          </Button>
        </form>
      </div>

      {data.error ? <div className="notice">{data.error}</div> : null}

      <DashboardStats {...data.stats} />

      <div className="dashboard-grid">
        <LatestReportCard report={data.latestReport} />
        <Card title="Recent Runs">
          <RecentRunsTable runs={data.runs} />
        </Card>
      </div>

      <Card title="SMS Deliveries">
        <SmsDeliveriesTable deliveries={data.deliveries} />
      </Card>

      <Card title="Video Classification">
        <VideoClassificationTable reports={data.reports} />
      </Card>
    </div>
  );
}
