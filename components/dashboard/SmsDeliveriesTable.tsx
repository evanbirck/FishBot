import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime, truncateMiddle } from "@/lib/formatters";
import type { DeliveryForDashboard } from "@/lib/supabase/queries";

type SmsDeliveriesTableProps = {
  deliveries: DeliveryForDashboard[];
};

export function SmsDeliveriesTable({ deliveries }: SmsDeliveriesTableProps) {
  if (!deliveries.length) {
    return <EmptyState title="No SMS deliveries" description="Delivery status appears here after summaries are sent." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Delivered</th>
            <th>SID</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td>
                {delivery.recipient_name}
                <span className="muted-cell">{delivery.recipient_phone_masked}</span>
              </td>
              <td>
                <Badge tone={statusTone(delivery.status)}>{delivery.status}</Badge>
              </td>
              <td>{formatDateTime(delivery.sent_at)}</td>
              <td>{formatDateTime(delivery.delivered_at)}</td>
              <td>{truncateMiddle(delivery.provider_message_sid, 7)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
