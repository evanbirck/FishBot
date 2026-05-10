import { Card } from "@/components/ui/Card";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import { getRunsData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const data = await getRunsData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Automation</p>
          <h1>Runs</h1>
          <p>Cron and historical testing executions from the saved run history.</p>
        </div>
      </div>
      {data.error ? <div className="notice">{data.error}</div> : null}
      <Card title="Run History">
        <RecentRunsTable runs={data.runs} />
      </Card>
    </div>
  );
}
