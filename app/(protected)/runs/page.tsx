import { Card } from "@/components/ui/Card";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import { getDashboardData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const data = await getDashboardData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Automation</p>
          <h1>Runs</h1>
          <p>Recent cron and manual pipeline executions.</p>
        </div>
      </div>
      {data.error ? <div className="notice">{data.error}</div> : null}
      <Card title="Recent Runs">
        <RecentRunsTable runs={data.runs} />
      </Card>
    </div>
  );
}
