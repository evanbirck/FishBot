import { WEEKLY_REPORT_JOB_NAME, SMS_PROVIDER } from "@/lib/constants";
import { estimateOpenAiCostUsd, roundMoney } from "@/lib/costing";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { manualRunKey, shouldSkipRun, weeklyRunKey } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { formatWeeklyDigest, type ExtraUploadOption } from "@/lib/sms/format-digest";
import { sendSmsMessages } from "@/lib/sms";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";
import { createPlaceholderSummary, getPromptVersion, reportSummarySchema, summarizeReportWithUsage } from "@/lib/summarize";
import { fetchTranscript } from "@/lib/transcript";
import { discoverAndClassifyRecentUploads, type YouTubeVideoCandidate } from "@/lib/youtube";
import type { VideoClassification } from "@/lib/youtube/classify-video";

export type PipelineTrigger = "cron" | "manual" | "backfill";

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

export async function runWeeklyReport(input: PipelineInput): Promise<PipelineResult> {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const runKey = input.runKey ?? (input.trigger === "cron" ? weeklyRunKey() : manualRunKey());
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

    const existingSummary = weeklyVideo ? await getExistingSummary(weeklyVideo.id) : null;
    const summary = weeklyVideo ? existingSummary ?? (await createSummaryForVideo(weeklyVideo, env)) : null;

    const deliveryCount = await sendWeeklyDigestToActiveRecipients({
      jobRunId: jobRun.run.id,
      weeklyVideo: weeklyVideo ?? null,
      summary,
      extraVideos,
      env
    });

    const notes = summary
      ? `Processed weekly report and sent ${deliveryCount} digest message set(s).`
      : extraVideos.length
        ? `No high-confidence weekly report; sent optional-summary digest for ${extraVideos.length} upload(s).`
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

export async function createSummaryForVideo(video: Tables<"videos">, env: ReturnType<typeof getServerEnv>) {
  const supabase = getSupabaseAdmin();
  const transcript = await fetchTranscript(video.youtube_video_id);

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
      .eq("id", video.id);
  } else {
    await supabase
      .from("videos")
      .update({
        transcript_status: "placeholder",
        transcript_source: transcript.source,
        transcript_language: null,
        transcript_text: transcript.reason,
        transcript_hash: null,
        processed_at: new Date().toISOString()
      })
      .eq("id", video.id);
  }

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
    video_id: video.id,
    model: transcript.status === "found" ? env.OPENAI_SUMMARY_MODEL : "placeholder",
    prompt_version: getPromptVersion(),
    summary_json: summaryResult.summary as unknown as Json,
    sms_text: "",
    char_count: 0,
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
          sms_text: summaryInsert.sms_text,
          char_count: summaryInsert.char_count
        },
        { onConflict: "video_id" }
      )
      .select("*")
      .single();
  }

  if (result.error) throw result.error;

  await supabase
    .from("videos")
    .update({
      user_approval_status: video.user_approval_status === "ignored" ? "ignored" : "summarized",
      summarized_at: new Date().toISOString()
    })
    .eq("id", video.id);

  return result.data;
}

async function sendWeeklyDigestToActiveRecipients(input: {
  jobRunId: string;
  weeklyVideo: Tables<"videos"> | null;
  summary: Tables<"summaries"> | null;
  extraVideos: Tables<"videos">[];
  env: ReturnType<typeof getServerEnv>;
}) {
  const supabase = getSupabaseAdmin();
  const recipients = await supabase
    .from("recipients")
    .select("*")
    .eq("active", true)
    .eq("opt_in_confirmed", true);

  if (recipients.error) throw recipients.error;
  if (!input.summary && input.extraVideos.length === 0) return 0;

  let deliveryCount = 0;
  const weeklySummaryJson = input.summary ? reportSummarySchema.parse(input.summary.summary_json) : null;
  const reportDate = input.weeklyVideo ? new Date(input.weeklyVideo.published_at).toLocaleDateString("en-US") : null;

  for (const recipient of recipients.data ?? []) {
    const options = await createPendingOptionsForRecipient({
      recipientId: recipient.id,
      videos: input.extraVideos,
      digestMessageId: input.jobRunId
    });

    const digest = formatWeeklyDigest({
      reportDate,
      weeklyReport:
        input.weeklyVideo && weeklySummaryJson
          ? {
              summary: weeklySummaryJson,
              videoUrl: input.weeklyVideo.video_url
            }
          : null,
      extraUploads: options.map((option) => ({
        optionNumber: option.option_number,
        title: option.video.title,
        url: option.video.video_url
      })),
      maxChunk: 1200
    });

    if (input.summary) {
      await supabase
        .from("summaries")
        .update({
          sms_text: digest.text,
          char_count: digest.text.length
        })
        .eq("id", input.summary.id);
    }

    const delivery = await supabase
      .from("sms_deliveries")
      .insert({
        summary_id: input.summary?.id ?? null,
        recipient_id: recipient.id,
        provider: SMS_PROVIDER,
        status: input.env.ENABLE_SMS ? "queued" : "skipped"
      })
      .select("*")
      .single();

    if (delivery.error) {
      if (delivery.error.code === "23505") continue;
      throw delivery.error;
    }

    if (input.env.ENABLE_SMS) {
      const results = await sendSmsMessages(input.env, recipient.phone_e164, digest.messages);
      const first = results[0];
      await supabase
        .from("sms_deliveries")
        .update({
          provider_message_sid: first?.providerMessageSid ?? null,
          status: first?.status ?? "sent",
          num_segments: results.reduce((sum, result) => sum + result.numSegments, 0),
          sent_at: new Date().toISOString()
        })
        .eq("id", delivery.data.id);
    }

    deliveryCount += 1;
  }

  if (input.extraVideos.length) {
    await supabase
      .from("videos")
      .update({ included_in_digest_at: new Date().toISOString() })
      .in("id", input.extraVideos.map((video) => video.id));
  }

  return deliveryCount;
}

async function createPendingOptionsForRecipient(input: {
  recipientId: string;
  videos: Tables<"videos">[];
  digestMessageId: string;
}): Promise<Array<Tables<"pending_video_options"> & { video: Tables<"videos"> }>> {
  const supabase = getSupabaseAdmin();
  if (!input.videos.length) return [];

  await supabase
    .from("pending_video_options")
    .update({ status: "expired" })
    .eq("recipient_id", input.recipientId)
    .eq("status", "pending");

  const created: Array<Tables<"pending_video_options"> & { video: Tables<"videos"> }> = [];
  let optionNumber = 1;

  for (const video of input.videos) {
    const inserted = await supabase
      .from("pending_video_options")
      .insert({
        recipient_id: input.recipientId,
        video_id: video.id,
        option_number: optionNumber,
        digest_message_id: input.digestMessageId,
        status: "pending"
      })
      .select("*")
      .single();

    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
    } else {
      created.push({ ...inserted.data, video });
      optionNumber += 1;
    }
  }

  return created;
}
