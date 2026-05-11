"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { formatWeeklyEmailDigest } from "@/lib/email/format-digest";
import { getServerEnv, inspectEnvReadiness } from "@/lib/env";
import { runHistoricalBackfill } from "@/lib/backfill";
import { createSummaryForVideo, getExistingSummary, prefetchTranscriptForVideo, startJobRun, upsertChannel, upsertClassifiedVideo } from "@/lib/pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportSummarySchema } from "@/lib/summarize";
import type { Tables } from "@/lib/supabase/types";
import { classifyVideoForReport, type VideoClassification } from "@/lib/youtube/classify-video";
import { fetchUploadsInDateRange, resolveUploadsPlaylist, type YouTubeVideoCandidate } from "@/lib/youtube";

export async function runHistoricalBackfillAction(formData: FormData) {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Historical test run is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const dryRun = formData.get("dryRun") === "on";
  const result = await runHistoricalBackfill({ startDate, endDate, dryRun });

  revalidatePath("/testing");
  revalidatePath("/runs");
  revalidatePath("/reports");
  revalidatePath("/costs");

  const params = new URLSearchParams({
    status: "done",
    mode: dryRun ? "dry" : "run",
    videos: String(result.totalVideos),
    weekly: String(result.weeklyReports),
    summarized: String(result.summarized),
    skipped: String(result.skippedExisting)
  });
  redirect(`/testing?${params.toString()}`);
}

export async function sendTestEmailAction() {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Test email is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const subject = `FishBot test email - ${new Date().toLocaleString("en-US")}`;
  const text = [
    "FishBot test email",
    "",
    "If you received this, Gmail SMTP is configured correctly.",
    `To: ${env.EMAIL_TO}`,
    `App: ${env.APP_BASE_URL}`
  ].join("\n");

  let deliveryId: string | null = null;
  const queued = await supabase
    .from("email_deliveries")
    .insert({
      subject,
      email_to: env.EMAIL_TO,
      email_from: env.EMAIL_FROM || env.GMAIL_SMTP_USER || "FishBot",
      provider: "gmail_smtp",
      status: "queued"
    })
    .select("id")
    .maybeSingle();
  if (queued.data?.id) deliveryId = queued.data.id;

  const params = new URLSearchParams();
  try {
    const result = await sendEmail(env, { subject, text });
    if (deliveryId) {
      await supabase
        .from("email_deliveries")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status,
          sent_at: result.status === "sent" ? new Date().toISOString() : null
        })
        .eq("id", deliveryId);
    }
    params.set("email", result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test email failed.";
    if (deliveryId) {
      await supabase
        .from("email_deliveries")
        .update({
          status: "failed",
          error_message: message
        })
        .eq("id", deliveryId);
    }
    params.set("email", "failed");
    params.set("message", message.slice(0, 180));
  }

  revalidatePath("/testing");
  revalidatePath("/dashboard");
  redirect(`/testing?${params.toString()}`);
}

type ClassifiedCandidate = YouTubeVideoCandidate & {
  classification: VideoClassification;
};

export async function emailSelectedWeekAction(formData: FormData) {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Weekly test email is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const weekStart = String(formData.get("weekStart") ?? "");
  const { startDate, endDate, label } = getWeekRange(weekStart);
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const runKey = `week-email-${startDate}-${endDate}-${Date.now()}`;
  const jobRun = await startJobRun(runKey, "backfill");
  const params = new URLSearchParams();

  try {
    const channelInfo = await resolveUploadsPlaylist(env);
    const uploads = await fetchUploadsInDateRange(env, channelInfo.uploadsPlaylistId, startDate, endDate, 150);
    const classified: ClassifiedCandidate[] = await Promise.all(
      uploads.map(async (upload) => ({
        ...upload,
        classification: await classifyVideoForReport(upload, {
          openAiApiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_SUMMARY_MODEL
        })
      }))
    );

    const channel = await upsertChannel({
      youtube_channel_id: channelInfo.channelId,
      youtube_handle: env.YOUTUBE_CHANNEL_HANDLE,
      title: channelInfo.title,
      uploads_playlist_id: channelInfo.uploadsPlaylistId,
      active: true,
      last_checked_at: new Date().toISOString()
    });

    const videos = await Promise.all(classified.map((candidate) => upsertClassifiedVideo(channel.id, candidate)));
    const videoByYoutubeId = new Map(videos.map((video) => [video.youtube_video_id, video]));
    const weeklyCandidates = classified.filter(
      (candidate) => candidate.classification.classification === "weekly_report" && candidate.classification.confidence === "high"
    );
    const weeklyCandidate = weeklyCandidates.sort((a, b) => b.classification.score - a.classification.score)[0] ?? null;
    const weeklyVideo = weeklyCandidate ? videoByYoutubeId.get(weeklyCandidate.videoId) ?? null : null;
    const extraVideos = classified
      .filter((candidate) => !weeklyCandidate || candidate.videoId !== weeklyCandidate.videoId)
      .filter((candidate) => candidate.classification.recommendedAction === "ask_user")
      .map((candidate) => videoByYoutubeId.get(candidate.videoId))
      .filter((video): video is Tables<"videos"> => Boolean(video));

    let summary: Tables<"summaries"> | null = null;
    let summarized = 0;
    let skippedExisting = 0;

    if (weeklyVideo) {
      const existing = await getExistingSummary(weeklyVideo.id);
      if (existing) {
        summary = existing;
        skippedExisting = 1;
      } else {
        summary = await createSummaryForVideo(weeklyVideo, env);
        summarized = 1;
      }
    }

    await Promise.all(extraVideos.map((video) => prefetchTranscriptForVideo(video)));

    const weeklySummary = summary ? reportSummarySchema.parse(summary.summary_json) : null;
    const digest = formatWeeklyEmailDigest({
      reportDate: label,
      weeklyReport:
        weeklyVideo && weeklySummary
          ? {
              summary: weeklySummary,
              videoUrl: weeklyVideo.video_url
            }
          : null,
      extraUploads: extraVideos.map((video) => ({
        title: video.title,
        url: video.video_url,
        youtubeVideoId: video.youtube_video_id
      })),
      env
    });

    if (!weeklyVideo && extraVideos.length === 0) {
      await supabase
        .from("job_runs")
        .update({
          status: "succeeded",
          notes: `Weekly email test found no uploads needing email for ${label}.`,
          metadata: { trigger: "week_email_test", startDate, endDate, totalVideos: classified.length },
          finished_at: new Date().toISOString()
        })
        .eq("id", jobRun.run.id);

      params.set("weekEmail", "empty");
      params.set("uploads", String(classified.length));
    } else {
      const delivery = await supabase
        .from("email_deliveries")
        .insert({
          summary_id: summary?.id ?? null,
          subject: digest.subject,
          email_to: env.EMAIL_TO,
          email_from: env.EMAIL_FROM || env.GMAIL_SMTP_USER || "FishBot",
          provider: "gmail_smtp",
          status: "queued"
        })
        .select("id")
        .maybeSingle();

      let emailResult: Awaited<ReturnType<typeof sendEmail>>;
      try {
        emailResult = await sendEmail(env, digest);
      } catch (error) {
        if (delivery.data?.id) {
          await supabase
            .from("email_deliveries")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Weekly test email failed."
            })
            .eq("id", delivery.data.id);
        }
        throw error;
      }

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

      if (summary) {
        await supabase
          .from("summaries")
          .update({
            digest_text: digest.text,
            char_count: digest.text.length
          })
          .eq("id", summary.id);
      }

      if (extraVideos.length) {
        await supabase
          .from("videos")
          .update({ included_in_digest_at: new Date().toISOString() })
          .in("id", extraVideos.map((video) => video.id));
      }

      await supabase
        .from("job_runs")
        .update({
          status: emailResult.status === "skipped" ? "skipped" : "succeeded",
          notes: `Weekly email test sent ${emailResult.status} digest for ${label}; ${extraVideos.length} extra upload link(s).`,
          metadata: {
            trigger: "week_email_test",
            startDate,
            endDate,
            totalVideos: classified.length,
            weeklyReports: weeklyCandidates.length,
            summarized,
            skippedExisting,
            extraUploads: extraVideos.length,
            emailStatus: emailResult.status
          },
          finished_at: new Date().toISOString()
        })
        .eq("id", jobRun.run.id);

      params.set("weekEmail", emailResult.status);
      params.set("uploads", String(classified.length));
      params.set("weekly", String(weeklyCandidates.length));
      params.set("extras", String(extraVideos.length));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weekly test email failed.";
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        notes: message,
        metadata: { trigger: "week_email_test", startDate, endDate },
        finished_at: new Date().toISOString()
      })
      .eq("id", jobRun.run.id);

    params.set("weekEmail", "failed");
    params.set("message", message.slice(0, 180));
  }

  revalidatePath("/testing");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/runs");
  revalidatePath("/costs");
  redirect(`/testing?${params.toString()}`);
}

export async function repairPlaceholderSummariesAction() {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Placeholder repair is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const videos = await supabase
    .from("videos")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(50);

  if (videos.error) throw videos.error;

  const videoIds = (videos.data ?? []).map((video) => video.id);
  const summaries = videoIds.length
    ? await supabase.from("summaries").select("video_id,model").in("video_id", videoIds)
    : { data: [], error: null };
  if (summaries.error) throw summaries.error;

  const summaryModelByVideoId = new Map((summaries.data ?? []).map((summary) => [summary.video_id, summary.model]));
  const repairCandidates = (videos.data ?? []).filter((video) => {
    const summaryModel = summaryModelByVideoId.get(video.id);
    return (
      video.transcript_status === "placeholder" ||
      video.transcript_status === "missing" ||
      video.transcript_status === "failed" ||
      summaryModel === "placeholder"
    );
  });

  let repaired = 0;
  let stillPlaceholder = 0;
  let failed = 0;
  let failureMessage = "";
  const selectedCandidates = repairCandidates.slice(0, 25);
  for (const video of selectedCandidates) {
    try {
      if (video.classification === "weekly_report" && video.classification_confidence === "high") {
        const summary = await createSummaryForVideo(video, env);
        if (summary.model === "placeholder") {
          stillPlaceholder += 1;
        } else {
          repaired += 1;
        }
      } else {
        const transcript = await prefetchTranscriptForVideo(video);
        if (transcript.status === "found") {
          repaired += 1;
        } else {
          stillPlaceholder += 1;
        }
      }
    } catch (error) {
      failed += 1;
      failureMessage ||= error instanceof Error ? error.message : "Repair failed.";
    }
  }

  revalidatePath("/testing");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/costs");

  const params = new URLSearchParams({
    repair: "done",
    checked: String(selectedCandidates.length),
    repaired: String(repaired),
    placeholder: String(stillPlaceholder),
    failed: String(failed)
  });
  if (failureMessage) params.set("message", failureMessage.slice(0, 180));
  redirect(`/testing?${params.toString()}`);
}

function getWeekRange(weekStart: string): { startDate: string; endDate: string; label: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error("Choose a valid week start date.");
  }

  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Choose a valid week start date.");
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: `${start.toLocaleDateString("en-US", { timeZone: "UTC" })}-${end.toLocaleDateString("en-US", { timeZone: "UTC" })}`
  };
}
