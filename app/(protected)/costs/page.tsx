import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getCostData } from "@/lib/cost-data";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const data = await getCostData();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Usage accounting</p>
          <h1>Costs</h1>
          <p>Estimated OpenAI token spend and per-summary usage records.</p>
        </div>
      </div>

      {data.error ? <div className="notice">{data.error}</div> : null}
      {data.totals.estimatedRows ? (
        <div className="notice">Some rows predate exact token capture, so FishBot estimated those token counts from stored transcript and summary text.</div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <p>Total cost</p>
          <strong>{formatUsd(data.totals.totalCostUsd)}</strong>
        </div>
        <div className="stat-card">
          <p>OpenAI estimate</p>
          <strong>{formatUsd(data.totals.openAiCostUsd)}</strong>
        </div>
        <div className="stat-card">
          <p>Tokens</p>
          <strong>{formatNumber(data.totals.totalTokens)}</strong>
        </div>
      </div>

      <div className="section-grid">
        <Card title="OpenAI Tokens">
          <dl className="settings-list">
            <div>
              <dt>Input tokens</dt>
              <dd>{formatNumber(data.totals.inputTokens)}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{formatNumber(data.totals.outputTokens)}</dd>
            </div>
            <div>
              <dt>Summary rows</dt>
              <dd>{formatNumber(data.totals.summaries)}</dd>
            </div>
            <div>
              <dt>Estimated rows</dt>
              <dd>{formatNumber(data.totals.estimatedRows)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Recent Summary Usage">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Created</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.video_url ? <a href={row.video_url}>{row.video_title}</a> : row.video_title}
                    <span className="muted-cell">{formatDateTime(row.published_at)}</span>
                  </td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.model}</td>
                  <td>{formatNumber(row.resolved_total_tokens)}</td>
                  <td>{formatUsd(row.resolved_cost_usd)}</td>
                  <td>
                    <Badge tone={row.estimated ? "warning" : "success"}>{row.estimated ? "estimated" : "recorded"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length ? <p className="muted">No summaries have been generated yet.</p> : null}
      </Card>
    </div>
  );
}
