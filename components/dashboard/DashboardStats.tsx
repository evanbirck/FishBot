import { Activity, Clock, Radio, Send, Users } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/Badge";

type DashboardStatsProps = {
  totalReports: number;
  activeRecipients: number;
  smsSentThisMonth: number;
  lastRunStatus: string;
  typicalPublishTime: string;
};

export function DashboardStats({ totalReports, activeRecipients, smsSentThisMonth, lastRunStatus, typicalPublishTime }: DashboardStatsProps) {
  const items = [
    { label: "Reports", value: totalReports, icon: Radio },
    { label: "Last Run", value: <Badge tone={statusTone(lastRunStatus)}>{lastRunStatus}</Badge>, icon: Activity },
    { label: "Active Recipients", value: activeRecipients, icon: Users },
    { label: "SMS This Month", value: smsSentThisMonth, icon: Send },
    { label: "Typical weekly report publish time", value: typicalPublishTime, icon: Clock }
  ];

  return (
    <div className="stats-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className="stat-card" key={item.label}>
            <div className="stat-icon" aria-hidden="true">
              <Icon size={18} />
            </div>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </div>
        );
      })}
    </div>
  );
}
