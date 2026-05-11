import { createHash } from "node:crypto";
import { WEEKLY_REPORT_JOB_NAME } from "@/lib/constants";
import { estimateOpenAiCostUsd, roundMoney } from "@/lib/costing";
import { formatRequestedVideoEmail, formatWeeklyEmailDigest } from "@/lib/email/format-digest";
import { sendEmail } from "@/lib/email";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { shouldSkipRun, weeklyRunKey } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";
import { createPlaceholderSummary, getPromptVersion, reportSummarySchema, summarizeReportWithUsage, type ReportSummary } from "@/lib/summarize";
import { fetchTranscript } from "@/lib/transcript";
import { discoverAndClassifyRecentUploads, type YouTubeVideoCandidate } from "@/lib/youtube";
import type { VideoClassification } from "@/lib/youtube/classify-video";

export type PipelineTrigger = "cron" | "backfill";

type PipelineInput = {
  trigger: PipelineTrigger;
  runKey?: string;
};

export type PipelineResult = {
  status: "succeeded" | "skipped";
  runKey: string;
  videoId?: string;
  summaryId?: string;
  notes: string;
};

type ClassifiedCandidate = YouTubeVideoCandidate & {
  classification: VideoClassification;
};

export class MissingTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingTranscriptError";
  }
}

export async function runWeeklyReport(input: PipelineInput): Promise<PipelineResult> {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const runKey = input.runKey ?? weeklyRunKey();
  const jobRun = await startJobRun(runKey, input.trigger);

  if (jobRun.skipped) {
    return {
      status: "skipped",
      runKey,
      notes: "A completed job run already exists for this key."
    };
  }

  try {
    const discovery = await discoverAndClassifyRecentUploads(env, 10);
    const channel = await upsertChannel({
      youtube_channel_id: discovery.channel.channelId,
      youtube_handle: env.YOUTUBE_CHANNEL_HANDLE,
      title: discovery.channel.title,
      uploads_playlist_id: discovery.channel.uploadsPlaylistId,
      active: true,
      last_checked_at: new Date().toISOString()
    });

    const savedVideos = await Promise.all(
      discovery.candidates.map((candidate) => upsertClassifiedVideo(channel.id, candidate))
    );

    const weeklyVideo = savedVideos.find(
      (video) => video.classification === "weekly_report" && video.classification_confidence === "high"
    );
    const extraVideos = savedVideos.filter(
      (video) =>
        (video.classification === "possible_report" || video.classification === "extra_upload") &&
        video.included_in_digest_at === null
    );

    let summary: Tables<"summaries"> | null = null;
    if (weeklyVideo) {
      summary = usableSummaryOrNull(await getExistingSummary(weeklyVideo.id));
      if (!summary) {
        summary = usableSummaryOrNull(await createSummaryForVideo(weeklyVideo, env));
      }
    }

    const deliveryCount = await sendWeeklyDigestEmail({
      weeklyVideo: weeklyVideo ?? null,
      summary,
      extraVideos,
      env
    });

    const notes = summary
      ? deliveryCount > 0
        ? "Processed weekly report and sent an email digest."
        : "Processed weekly report, but email delivery is disabled or not configured."
      : weeklyVideo
        ? "Found weekly report, but no usable transcript was available after retrying extraction."
        : extraVideos.length
        ? deliveryCount > 0
          ? `No high-confidence weekly report; sent email review links for ${extraVideos.length} upload(s).`
          : `No high-confidence weekly report; found ${extraVideos.length} optional upload(s), but email delivery is disabled or not configured.`
        : "No high-confidence weekly report or new extra uploads found.";

    await supabase
      .from("job_runs")
      .update({
        status: "succeeded",
        notes,
        metadata: {
          trigger: input.trigger,
          classifiedVideos: savedVideos.map((video) => ({
            youtubeVideoId: video.youtube_video_id,
            classification: video.classification,
            confidence: video.classification_confidence,
            score: video.classification_score,
            action: video.recommended_action
          }))
        },
        finished_at: new Date().toISOString()
      })
      .eq("id", jobRun.run.id);

    return {
      status: "succeeded",
      runKey,
      videoId: weeklyVideo?.youtube_video_id,
      summaryId: summary?.id,
      notes
    };
  } catch (error) {
    logger.error("Weekly report pipeline failed", error, { runKey });
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        notes: getErrorMessage(error),
        metadata: { trigger: input.trigger },
        finished_at: new Date().toISOString()
      })
      .eq("id", jobRun.run.id);
    throw error;
  }
}

export async function startJobRun(runKey: string, trigger: PipelineTrigger) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("job_runs")
    .select("*")
    .eq("job_name", WEEKLY_REPORT_JOB_NAME)
    .eq("run_key", runKey)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data && shouldSkipRun(existing.data)) {
    return { run: existing.data, skipped: true };
  }

  if (existing.data) {
    const updated = await supabase
      .from("job_runs")
      .update({
        status: "started",
        notes: `Restarted ${trigger} run`,
        metadata: { trigger },
        started_at: new Date().toISOString(),
        finished_at: null
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (updated.error) throw updated.error;
    return { run: updated.data, skipped: false };
  }

  const inserted = await supabase
    .from("job_runs")
    .insert({
      job_name: WEEKLY_REPORT_JOB_NAME,
      run_key: runKey,
      status: "started",
      notes: `Started ${trigger} run`,
      metadata: { trigger }
    })
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return { run: inserted.data, skipped: false };
}

export async function upsertChannel(channel: {
  youtube_channel_id: string;
  youtube_handle: string;
  title: string;
  uploads_playlist_id: string;
  active: boolean;
  last_checked_at: string;
}) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("channels").upsert(channel, { onConflict: "youtube_channel_id" }).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function upsertClassifiedVideo(channelId: string, candidate: ClassifiedCandidate) {
  const classification = candidate.classification;
  const now = new Date().toISOString();
  const userApprovalStatus =
    classification.recommendedAction === "ask_user"
      ? "summary_available_on_request"
      : classification.recommendedAction === "ignore"
        ? "ignored"
        : "none";

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("videos")
    .upsert(
      {
        channel_id: channelId,
        youtube_video_id: candidate.videoId,
        title: candidate.title,
        description: candidate.description,
        video_url: candidate.url,
        published_at: candidate.publishedAt,
        detected_as_weekly_report: classification.isWeeklyReport,
        report_score: Math.round(classification.score),
        classification: classification.classification,
        classification_status: "classified",
        classification_confidence: classification.confidence,
        classification_score: classification.score,
        classification_reason: classification.reason,
        recommended_action: classification.recommendedAction,
        user_approval_status: userApprovalStatus,
        approval_requested_at: classification.recommendedAction === "ask_user" ? now : null,
        ignored_at: classification.recommendedAction === "ignore" ? now : null
      },
      { onConflict: "youtube_video_id" }
    )
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data;
}

export async function getExistingSummary(videoId: string) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("summaries").select("*").eq("video_id", videoId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export function usableSummaryOrNull(summary: Tables<"summaries"> | null): Tables<"summaries"> | null {
  if (!summary || summary.model === "placeholder") return null;
  return summary;
}

export async function prefetchTranscriptForVideo(video: Tables<"videos">) {
  if (video.transcript_status === "found" && video.transcript_text && video.transcript_text.length > 100) {
    return {
      status: "found" as const,
      source: (video.transcript_source as "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel" | null) ?? "youtube-transcript",
      language: video.transcript_language,
      text: video.transcript_text,
      hash: video.transcript_hash ?? createHash("sha256").update(video.transcript_text).digest("hex")
    };
  }

  const transcript = await fetchTranscript(video.youtube_video_id);
  await storeTranscriptForVideo(video.id, transcript, "missing");
  return transcript;
}

export async function createSummaryForVideo(
  video: Tables<"videos">,
  env: ReturnType<typeof getServerEnv>,
  options: { storePlaceholder?: boolean } = {}
) {
  const supabase = getSupabaseAdmin();
  const transcript =
    video.transcript_status === "found" && video.transcript_text && video.transcript_text.length > 100
      ? {
          status: "found" as const,
          source: (video.transcript_source as "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel" | null) ?? "youtube-transcript",
          language: video.transcript_language,
          text: video.transcript_text,
          hash: video.transcript_hash ?? createHash("sha256").update(video.transcript_text).digest("hex")
        }
      : await fetchTranscript(video.youtube_video_id);

  if (transcript.status !== "found" && options.storePlaceholder === false) {
    await storeTranscriptForVideo(video.id, transcript, "missing");
    await supabase
      .from("videos")
      .update({
        user_approval_status: video.user_approval_status === "ignored" ? "ignored" : "summary_available_on_request",
        summarized_at: null
      })
      .eq("id", video.id);
    throw new MissingTranscriptError(transcript.reason);
  }

  await storeTranscriptForVideo(video.id, transcript, transcript.status === "found" ? "found" : "placeholder");

  const summaryResult =
    transcript.status === "found"
      ? await summarizeReportWithUsage(env, {
          title: video.title,
          publishedAt: video.published_at,
          transcriptStatus: "found",
          transcriptText: transcript.text,
          transcriptSource: transcript.source,
          videoUrl: video.video_url
        })
      : {
          summary: createPlaceholderSummary({
            title: video.title,
            publishedAt: video.published_at,
            videoUrl: video.video_url,
            reason: transcript.reason
          }),
          usage: null
        };
  const estimatedCost = summaryResult.usage ? roundMoney(estimateOpenAiCostUsd(summaryResult.usage, env)) : null;
  const priceSnapshot =
    summaryResult.usage && estimatedCost !== null
      ? {
          inputCostPer1M: env.OPENAI_INPUT_COST_PER_1M,
          outputCostPer1M: env.OPENAI_OUTPUT_COST_PER_1M
        }
      : {};

  const summaryInsert = {
    ...buildSummaryStorageFields({
      summary: summaryResult.summary,
      videoUrl: video.video_url,
      title: video.title
    }),
    video_id: video.id,
    model: transcript.status === "found" ? env.OPENAI_SUMMARY_MODEL : "placeholder",
    prompt_version: getPromptVersion(),
    summary_json: summaryResult.summary as unknown as Json,
    input_tokens: summaryResult.usage?.inputTokens ?? null,
    output_tokens: summaryResult.usage?.outputTokens ?? null,
    total_tokens: summaryResult.usage?.totalTokens ?? null,
    estimated_openai_cost_usd: estimatedCost,
    cost_source: summaryResult.usage ? "openai_usage" : "placeholder",
    model_price_snapshot: priceSnapshot as Json
  };
  let result = await supabase
    .from("summaries")
    .upsert(
      summaryInsert,
      { onConflict: "video_id" }
    )
    .select("*")
    .single();

  if (result.error && result.error.code === "PGRST204") {
    result = await supabase
      .from("summaries")
      .upsert(
        {
          video_id: summaryInsert.video_id,
          model: summaryInsert.model,
          prompt_version: summaryInsert.prompt_version,
          summary_json: summaryInsert.summary_json,
          digest_text: summaryInsert.digest_text,
          char_count: summaryInsert.char_count
        },
        { onConflict: "video_id" }
      )
      .select("*")
      .single();
  }

  if (result.error) throw result.error;

  const didCreateRealSummary = result.data.model !== "placeholder";
  await supabase
    .from("videos")
    .update({
      user_approval_status: video.user_approval_status === "ignored" ? "ignored" : didCreateRealSummary ? "summarized" : "summary_available_on_request",
      summarized_at: didCreateRealSummary ? new Date().toISOString() : null
    })
    .eq("id", video.id);

  return result.data;
}

async function storeTranscriptForVideo(
  videoId: string,
  transcript: Awaited<ReturnType<typeof fetchTranscript>>,
  missingStatus: "found" | "missing" | "placeholder"
) {
  const supabase = getSupabaseAdmin();

  if (transcript.status === "found") {
    await supabase
      .from("videos")
      .update({
        transcript_status: "found",
        transcript_source: transcript.source,
        transcript_language: transcript.language,
        transcript_text: transcript.text,
        transcript_hash: transcript.hash,
        processed_at: new Date().toISOString()
      })
      .eq("id", videoId);
    return;
  }

  await supabase
    .from("videos")
    .update({
      transcript_status: missingStatus,
      transcript_source: transcript.source,
      transcript_language: null,
      transcript_text: transcript.reason,
      transcript_hash: null,
      processed_at: new Date().toISOString()
    })
    .eq("id", videoId);
}

export async function createSummaryForVideoWithManualTranscript(video: Tables<"videos">, env: ReturnType<typeof getServerEnv>, transcriptText: string) {
  const cleanedTranscript = transcriptText.replace(/\s+/g, " ").trim();
  if (cleanedTranscript.length < 100) {
    throw new Error("Paste a longer transcript before summarizing.");
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("videos")
    .update({
      transcript_status: "found",
      transcript_source: "manual",
      transcript_language: "en",
      transcript_text: cleanedTranscript,
      transcript_hash: createHash("sha256").update(cleanedTranscript).digest("hex"),
      processed_at: new Date().toISOString()
    })
    .eq("id", video.id);

  const summaryResult = await summarizeReportWithUsage(env, {
    title: video.title,
    publishedAt: video.published_at,
    transcriptStatus: "found",
    transcriptText: cleanedTranscript,
    transcriptSource: "manual",
    videoUrl: video.video_url
  });
  const estimatedCost = summaryResult.usage ? roundMoney(estimateOpenAiCostUsd(summaryResult.usage, env)) : null;
  const priceSnapshot =
    summaryResult.usage && estimatedCost !== null
      ? {
          inputCostPer1M: env.OPENAI_INPUT_COST_PER_1M,
          outputCostPer1M: env.OPENAI_OUTPUT_COST_PER_1M
        }
      : {};

  const result = await supabase
    .from("summaries")
    .upsert(
      {
        ...buildSummaryStorageFields({
          summary: summaryResult.summary,
          videoUrl: video.video_url,
          title: video.title
        }),
        video_id: video.id,
        model: env.OPENAI_SUMMARY_MODEL,
        prompt_version: getPromptVersion(),
        summary_json: summaryResult.summary as unknown as Json,
        input_tokens: summaryResult.usage?.inputTokens ?? null,
        output_tokens: summaryResult.usage?.outputTokens ?? null,
        total_tokens: summaryResult.usage?.totalTokens ?? null,
        estimated_openai_cost_usd: estimatedCost,
        cost_source: summaryResult.usage ? "openai_usage" : "manual_transcript",
        model_price_snapshot: priceSnapshot as Json
      },
      { onConflict: "video_id" }
    )
    .select("*")
    .single();

  if (result.error) throw result.error;

  await supabase
    .from("videos")
    .update({
      user_approval_status: "summarized",
      summarized_at: new Date().toISOString()
    })
    .eq("id", video.id);

  return result.data;
}

function buildSummaryStorageFields(input: {
  title: string;
  summary: ReportSummary;
  videoUrl: string;
}) {
  const digest = formatRequestedVideoEmail({
    title: input.title,
    summary: input.summary,
    videoUrl: input.videoUrl
  });

  return {
    digest_text: digest.text,
    char_count: digest.text.length
  };
}

async function sendWeeklyDigestEmail(input: {
  weeklyVideo: Tables<"videos"> | null;
  summary: Tables<"summaries"> | null;
  extraVideos: Tables<"videos">[];
  env: ReturnType<typeof getServerEnv>;
}) {
  const supabase = getSupabaseAdmin();
  if (!input.summary && input.extraVideos.length === 0) return 0;
  if (!input.env.ENABLE_EMAIL) return 0;

  await Promise.all(input.extraVideos.map((video) => prefetchTranscriptForVideo(video)));

  const weeklySummaryJson = input.summary ? reportSummarySchema.parse(input.summary.summary_json) : null;
  const reportDate = input.weeklyVideo ? new Date(input.weeklyVideo.published_at).toLocaleDateString("en-US") : null;

  const digest = formatWeeklyEmailDigest({
    reportDate,
    weeklyReport:
      input.weeklyVideo && weeklySummaryJson
        ? {
            summary: weeklySummaryJson,
            videoUrl: input.weeklyVideo.video_url
          }
        : null,
    extraUploads: input.extraVideos.map((video) => ({
      title: video.title,
      url: video.video_url,
      youtubeVideoId: video.youtube_video_id
    })),
    env: input.env
  });

  if (input.summary) {
    await supabase
      .from("summaries")
      .update({
        digest_text: digest.text,
        char_count: digest.text.length
      })
      .eq("id", input.summary.id);
  }

  const delivery = await supabase
    .from("email_deliveries")
    .insert({
      summary_id: input.summary?.id ?? null,
      subject: digest.subject,
      email_to: input.env.EMAIL_TO,
      email_from: input.env.EMAIL_FROM || input.env.GMAIL_SMTP_USER || "FishBot",
      provider: "gmail_smtp",
      status: "queued"
    })
    .select("id")
    .maybeSingle();

  try {
    const emailResult = await sendEmail(input.env, digest);

    if (delivery.data?.id) {
      await supabase
        .from("email_deliveries")
        .update({
          provider_message_id: emailResult.providerMessageId,
          status: emailResult.status,
          sent_at: emailResult.status === "sent" ? new Date().toISOString() : null
        })
        .eq("id", delivery.data.id);
    }
  } catch (error) {
    if (delivery.data?.id) {
      await supabase
        .from("email_deliveries")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Email delivery failed."
        })
        .eq("id", delivery.data.id);
    }
    throw error;
  }

  if (input.extraVideos.length) {
    await supabase
      .from("videos")
      .update({ included_in_digest_at: new Date().toISOString() })
      .in("id", input.extraVideos.map((video) => video.id));
  }

  return 1;
}
