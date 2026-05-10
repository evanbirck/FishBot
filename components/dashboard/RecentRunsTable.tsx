import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/lib/supabase/types";

type RecentRunsTableProps = {
  runs: Tables<"job_runs">[];
};

export function RecentRunsTable({ runs }: RecentRunsTableProps) {
  if (!runs.length) {
    return <EmptyState title="No job runs" description="Cron and historical testing runs will be listed here." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Finished</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{formatDateTime(run.started_at)}</td>
              <td>{formatDateTime(run.finished_at)}</td>
              <td>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              </td>
              <td>{run.notes ?? "No notes"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
