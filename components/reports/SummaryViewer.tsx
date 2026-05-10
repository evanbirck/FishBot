import { Badge, statusTone } from "@/components/ui/Badge";
import type { ReportSummary } from "@/lib/summarize";

type SummaryViewerProps = {
  summary: ReportSummary;
};

export function SummaryViewer({ summary }: SummaryViewerProps) {
  const sections = [
    ["Bite", summary.biteStatus ? [summary.biteStatus] : []],
    ["Areas", summary.areas],
    ["Structure", summary.structure],
    ["Water clarity", summary.waterClarity],
    ["Water temperature", summary.waterTemperature],
    ["Tide/current", summary.tideCurrent],
    ["Weather/wind", summary.weatherWind],
    ["Baits", summary.baits],
    ["Colors", summary.colors],
    ["Presentations", summary.presentations],
    ["Depths", summary.depths],
    ["Species", summary.species],
    ["Warnings", summary.warnings],
    ["Game plan", summary.gamePlan]
  ].filter(([, values]) => Array.isArray(values) && values.length > 0) as Array<[string, string[]]>;

  return (
    <div className="summary-viewer">
      <div className="summary-heading">
        <h2>{summary.headline}</h2>
        <Badge tone={statusTone(summary.confidence === "high" ? "ok" : "placeholder")}>{summary.confidence} confidence</Badge>
      </div>
      <dl className="summary-facts">
        {sections.map(([label, values]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{values.join("; ")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
