import { ReportList } from "@/components/reports/ReportList";
import { getReportsData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getReportsData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">History</p>
          <h1>Reports</h1>
          <p>Detected videos, transcript states, and generated summaries from the saved history.</p>
        </div>
      </div>
      {data.error ? <div className="notice">{data.error}</div> : null}
      <ReportList reports={data.reports} />
    </div>
  );
}
