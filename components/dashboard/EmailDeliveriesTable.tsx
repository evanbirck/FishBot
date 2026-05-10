import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/lib/supabase/types";

type EmailDeliveriesTableProps = {
  deliveries: Tables<"email_deliveries">[];
};

export function EmailDeliveriesTable({ deliveries }: EmailDeliveriesTableProps) {
  if (!deliveries.length) {
    return <EmptyState title="No email deliveries" description="Gmail delivery attempts will be listed here after digests are sent." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Status</th>
            <th>To</th>
            <th>Subject</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td>{formatDateTime(delivery.created_at)}</td>
              <td>
                <Badge tone={statusTone(delivery.status)}>{delivery.status}</Badge>
              </td>
              <td>{maskEmail(delivery.email_to)}</td>
              <td>{delivery.subject}</td>
              <td>{delivery.error_message ?? delivery.provider_message_id ?? formatDateTime(delivery.sent_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!name || !domain) return "Configured";
  return `${name.slice(0, 2)}***@${domain}`;
}
