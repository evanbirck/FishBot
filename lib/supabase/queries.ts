import "server-only";

import { inspectEnvReadiness } from "@/lib/env";
import { calculateAveragePublishTime } from "@/lib/publish-time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportSummary } from "@/lib/summarize";
import type { Tables } from "@/lib/supabase/types";
import { reportSummarySchema } from "@/lib/summarize";

export type ReportWithSummary = Tables<"videos"> & {
  summary: (Tables<"summaries"> & { summary_json_typed: ReportSummary }) | null;
};

export type DashboardData = {
  latestReport: ReportWithSummary | null;
  reports: ReportWithSummary[];
  runs: Tables<"job_runs">[];
  emailDeliveries: Tables<"email_deliveries">[];
  stats: {
    totalReports: number;
    emailConfigured: boolean;
    lastRunStatus: string;
    typicalPublishTime: string;
  };
  error: string | null;
};

const EMPTY_DATA: DashboardData = {
  latestReport: null,
  reports: [],
  runs: [],
  emailDeliveries: [],
  stats: {
    totalReports: 0,
    emailConfigured: false,
    lastRunStatus: "not configured",
    typicalPublishTime: "Not enough data"
  },
  error: null
};

export async function getDashboardData(): Promise<DashboardData> {
  if (!inspectEnvReadiness().serverReady) {
    return {
      ...EMPTY_DATA,
      error: "Server environment is not fully configured yet. Add Supabase, API, Gmail SMTP, and cron secrets to load live data."
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const [videosResult, summariesResult, runsResult, emailDeliveriesResult] = await Promise.all([
      supabase.from("videos").select("*").order("published_at", { ascending: false }).limit(12),
      supabase.from("summaries").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(8),
      supabase.from("email_deliveries").select("*").order("created_at", { ascending: false }).limit(12)
    ]);

    const error = [videosResult.error, summariesResult.error, runsResult.error].find(Boolean);
    if (error) throw error;

    const summariesByVideoId = new Map(
      (summariesResult.data ?? []).map((summary) => [summary.video_id, withTypedSummary(summary)])
    );

    const reports = (videosResult.data ?? []).map((video) => ({
      ...video,
      summary: summariesByVideoId.get(video.id) ?? null
    }));

    const latestReport = reports.find((report) => report.classification === "weekly_report") ?? reports[0] ?? null;
    const lastRunStatus = runsResult.data?.[0]?.status ?? "not run";
    const typicalPublishTime =
      calculateAveragePublishTime(
        (videosResult.data ?? []).filter((video) => video.classification === "weekly_report").slice(0, 8)
      ) ?? "Not enough data";

    return {
      latestReport,
      reports,
      runs: runsResult.data ?? [],
      emailDeliveries: emailDeliveriesResult.error ? [] : (emailDeliveriesResult.data ?? []),
      stats: {
        totalReports: videosResult.data?.length ?? 0,
        emailConfigured: Boolean(process.env.EMAIL_TO && process.env.GMAIL_SMTP_USER),
        lastRunStatus,
        typicalPublishTime
      },
      error: null
    };
  } catch (error) {
    return {
      ...EMPTY_DATA,
      error: error instanceof Error ? error.message : "Could not load dashboard data."
    };
  }
}

export async function getReportByVideoId(videoId: string): Promise<ReportWithSummary | null> {
  if (!inspectEnvReadiness().serverReady) return null;

  const supabase = getSupabaseAdmin();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(videoId);
  const videoFilter = isUuid ? `youtube_video_id.eq.${videoId},id.eq.${videoId}` : `youtube_video_id.eq.${videoId}`;
  const video = await supabase.from("videos").select("*").or(videoFilter).maybeSingle();
  if (video.error) throw video.error;
  if (!video.data) return null;

  const summary = await supabase.from("summaries").select("*").eq("video_id", video.data.id).maybeSingle();
  if (summary.error) throw summary.error;

  return {
    ...video.data,
    summary: summary.data ? withTypedSummary(summary.data) : null
  };
}

export async function getSettingsData() {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    return {
      readiness,
      emailTo: "",
      channelTitle: "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: "Server environment is not fully configured."
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const channels = await supabase.from("channels").select("*").eq("active", true).limit(1).maybeSingle();

    if (channels.error) throw channels.error;

    return {
      readiness,
      emailTo: maskEmail(process.env.EMAIL_TO),
      channelTitle: channels.data?.title ?? "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: null
    };
  } catch (error) {
    return {
      readiness,
      emailTo: "",
      channelTitle: "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: error instanceof Error ? error.message : "Could not load settings data."
    };
  }
}

function maskEmail(value?: string): string {
  if (!value) return "Not configured";
  const [name, domain] = value.split("@");
  if (!name || !domain) return "Configured";
  return `${name.slice(0, 2)}***@${domain}`;
}

function withTypedSummary(summary: Tables<"summaries">) {
  return {
    ...summary,
    summary_json_typed: reportSummarySchema.parse(summary.summary_json)
  };
}
