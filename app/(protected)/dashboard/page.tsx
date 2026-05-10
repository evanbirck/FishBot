import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { LatestReportCard } from "@/components/dashboard/LatestReportCard";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import { SmsDeliveriesTable } from "@/components/dashboard/SmsDeliveriesTable";
import { VideoClassificationTable } from "@/components/dashboard/VideoClassificationTable";
import { Card } from "@/components/ui/Card";
import { getDashboardData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Dashboard</h1>
          <p>Latest report, cron history, transcript status, recipients, and Twilio delivery state.</p>
        </div>
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
