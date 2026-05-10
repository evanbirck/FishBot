type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const toneClass = {
  neutral: "badge-neutral",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info"
};

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge ${toneClass[tone]}`}>{children}</span>;
}

export function statusTone(status?: string | null): BadgeProps["tone"] {
  switch (status) {
    case "found":
    case "delivered":
    case "succeeded":
    case "sent":
    case "ok":
      return "success";
    case "placeholder":
    case "missing":
    case "skipped":
    case "queued":
    case "started":
      return "warning";
    case "failed":
    case "undelivered":
      return "danger";
    default:
      return "neutral";
  }
}
