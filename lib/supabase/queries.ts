import "server-only";

import { inspectEnvReadiness } from "@/lib/env";
import { maskPhone } from "@/lib/formatters";
import { calculateAveragePublishTime } from "@/lib/publish-time";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportSummary } from "@/lib/summarize";
import type { Tables } from "@/lib/supabase/types";
import { reportSummarySchema } from "@/lib/summarize";

export type ReportWithSummary = Tables<"videos"> & {
  summary: (Tables<"summaries"> & { summary_json_typed: ReportSummary }) | null;
};

export type DeliveryForDashboard = Tables<"sms_deliveries"> & {
  recipient_name: string;
  recipient_phone_masked: string;
};

export type PendingOptionForDashboard = Tables<"pending_video_options"> & {
  video: Tables<"videos"> | null;
};

export type DashboardData = {
  latestReport: ReportWithSummary | null;
  reports: ReportWithSummary[];
  runs: Tables<"job_runs">[];
  deliveries: DeliveryForDashboard[];
  pendingOptions: PendingOptionForDashboard[];
  stats: {
    totalReports: number;
    activeRecipients: number;
    smsSentThisMonth: number;
    lastRunStatus: string;
    typicalPublishTime: string;
  };
  error: string | null;
};

const EMPTY_DATA: DashboardData = {
  latestReport: null,
  reports: [],
  runs: [],
  deliveries: [],
  pendingOptions: [],
  stats: {
    totalReports: 0,
    activeRecipients: 0,
    smsSentThisMonth: 0,
    lastRunStatus: "not configured",
    typicalPublishTime: "Not enough data"
  },
  error: null
};

export async function getDashboardData(): Promise<DashboardData> {
  if (!inspectEnvReadiness().serverReady) {
    return {
      ...EMPTY_DATA,
      error: "Server environment is not fully configured yet. Add Supabase, API, Twilio, and cron secrets to load live data."
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [videosResult, summariesResult, runsResult, deliveriesResult, recipientsResult, sentMonthResult, pendingResult] = await Promise.all([
      supabase.from("videos").select("*").order("published_at", { ascending: false }).limit(12),
      supabase.from("summaries").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(8),
      supabase.from("sms_deliveries").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("recipients").select("*"),
      supabase
        .from("sms_deliveries")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", monthStart.toISOString())
        .in("status", ["sent", "delivered", "queued", "accepted"]),
      supabase.from("pending_video_options").select("*").order("created_at", { ascending: false }).limit(30)
    ]);

    const error = [videosResult.error, summariesResult.error, runsResult.error, deliveriesResult.error, recipientsResult.error, sentMonthResult.error, pendingResult.error].find(Boolean);
    if (error) throw error;

    const summariesByVideoId = new Map(
      (summariesResult.data ?? []).map((summary) => [summary.video_id, withTypedSummary(summary)])
    );

    const reports = (videosResult.data ?? []).map((video) => ({
      ...video,
      summary: summariesByVideoId.get(video.id) ?? null
    }));

    const recipientsById = new Map((recipientsResult.data ?? []).map((recipient) => [recipient.id, recipient]));
    const deliveries = (deliveriesResult.data ?? []).map((delivery) => {
      const recipient = recipientsById.get(delivery.recipient_id);
      return {
        ...delivery,
        recipient_name: recipient?.display_name ?? "Recipient",
        recipient_phone_masked: maskPhone(recipient?.phone_e164)
      };
    });

    const videosById = new Map((videosResult.data ?? []).map((video) => [video.id, video]));
    const pendingOptions = (pendingResult.data ?? []).map((option) => ({
      ...option,
      video: videosById.get(option.video_id) ?? null
    }));

    const activeRecipients = (recipientsResult.data ?? []).filter((recipient) => recipient.active && recipient.opt_in_confirmed).length;
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
      deliveries,
      pendingOptions,
      stats: {
        totalReports: videosResult.data?.length ?? 0,
        activeRecipients,
        smsSentThisMonth: sentMonthResult.count ?? 0,
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
  const data = await getDashboardData();
  return data.reports.find((report) => report.youtube_video_id === videoId) ?? null;
}

export async function getSettingsData() {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    return {
      readiness,
      recipientCount: 0,
      channelTitle: "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: "Server environment is not fully configured."
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const [recipients, channels] = await Promise.all([
      supabase.from("recipients").select("id", { count: "exact", head: true }).eq("active", true).eq("opt_in_confirmed", true),
      supabase.from("channels").select("*").eq("active", true).limit(1).maybeSingle()
    ]);

    if (recipients.error) throw recipients.error;
    if (channels.error) throw channels.error;

    return {
      readiness,
      recipientCount: recipients.count ?? 0,
      channelTitle: channels.data?.title ?? "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: null
    };
  } catch (error) {
    return {
      readiness,
      recipientCount: 0,
      channelTitle: "In Deep on the Delta with Steve Cooper",
      cronPath: "/api/cron/weekly-report",
      error: error instanceof Error ? error.message : "Could not load settings data."
    };
  }
}

function withTypedSummary(summary: Tables<"summaries">) {
  return {
    ...summary,
    summary_json_typed: reportSummarySchema.parse(summary.summary_json)
  };
}
