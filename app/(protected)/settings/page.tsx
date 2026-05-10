import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getSettingsData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettingsData();
  const readinessRows = [
    ["Browser env", data.readiness.browserReady],
    ["Server env", data.readiness.serverReady],
    ["Twilio callback URL", data.readiness.optional.TWILIO_STATUS_CALLBACK_URL],
    ["App base URL", data.readiness.optional.APP_BASE_URL]
  ] as const;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Read-only configuration</p>
          <h1>Settings</h1>
          <p>Source channel, cron path, environment readiness, and recipient counts without exposing secrets.</p>
        </div>
      </div>

      {data.error ? <div className="notice">{data.error}</div> : null}

      <section className="settings-grid">
        <Card title="Source">
          <dl className="settings-list">
            <div>
              <dt>Channel</dt>
              <dd>{data.channelTitle}</dd>
            </div>
            <div>
              <dt>Cron route</dt>
              <dd>{data.cronPath}</dd>
            </div>
            <div>
              <dt>Active recipients</dt>
              <dd>{data.recipientCount}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Environment">
          <div className="readiness-list">
            {readinessRows.map(([label, ready]) => (
              <div key={label}>
                <span>{label}</span>
                <Badge tone={ready ? "success" : "warning"}>{ready ? "ready" : "missing"}</Badge>
              </div>
            ))}
          </div>
          {data.readiness.serverMissing.length ? (
            <p className="muted">Missing required keys: {data.readiness.serverMissing.join(", ")}</p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
