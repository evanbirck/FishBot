import { ReportList } from "@/components/reports/ReportList";
import { getDashboardData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getDashboardData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">History</p>
          <h1>Reports</h1>
          <p>All detected weekly report videos, transcript states, and generated summaries.</p>
        </div>
      </div>
      {data.error ? <div className="notice">{data.error}</div> : null}
      <ReportList reports={data.reports} />
    </div>
  );
}
