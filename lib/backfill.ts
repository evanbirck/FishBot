import { getServerEnv } from "@/lib/env";
import { classifyVideoForReport, type VideoClassification } from "@/lib/youtube/classify-video";
import { createSummaryForVideo, getExistingSummary, startJobRun, upsertChannel, upsertClassifiedVideo } from "@/lib/pipeline";
import { fetchUploadsInDateRange, resolveUploadsPlaylist, type YouTubeVideoCandidate } from "@/lib/youtube";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BackfillInput = {
  startDate: string;
  endDate: string;
  dryRun: boolean;
};

type BackfillCandidate = YouTubeVideoCandidate & {
  classification: VideoClassification;
};

export type BackfillResult = {
  runKey: string;
  dryRun: boolean;
  totalVideos: number;
  weeklyReports: number;
  summarized: number;
  skippedExisting: number;
  candidates: Array<{
    title: string;
    publishedAt: string;
    url: string;
    classification: string;
    confidence: string;
    action: string;
  }>;
};

export async function runHistoricalBackfill(input: BackfillInput): Promise<BackfillResult> {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const runKey = `backfill-${input.startDate}-${input.endDate}-${Date.now()}`;
  const jobRun = await startJobRun(runKey, "backfill");

  try {
    const channelInfo = await resolveUploadsPlaylist(env);
    const candidates = await fetchUploadsInDateRange(env, channelInfo.uploadsPlaylistId, input.startDate, input.endDate, 150);
    const classified: BackfillCandidate[] = await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        classification: await classifyVideoForReport(candidate, {
          openAiApiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_SUMMARY_MODEL
        })
      }))
    );

    const weeklyReports = classified.filter(
      (candidate) => candidate.classification.classification === "weekly_report" && candidate.classification.confidence === "high"
    );

    let summarized = 0;
    let skippedExisting = 0;

    if (!input.dryRun) {
      const channel = await upsertChannel({
        youtube_channel_id: channelInfo.channelId,
        youtube_handle: env.YOUTUBE_CHANNEL_HANDLE,
        title: channelInfo.title,
        uploads_playlist_id: channelInfo.uploadsPlaylistId,
        active: true,
        last_checked_at: new Date().toISOString()
      });

      for (const candidate of classified) {
        const video = await upsertClassifiedVideo(channel.id, candidate);
        if (candidate.classification.classification !== "weekly_report" || candidate.classification.confidence !== "high") continue;
        const existing = await getExistingSummary(video.id);
        if (existing) {
          skippedExisting += 1;
          continue;
        }
        await createSummaryForVideo(video, env);
        summarized += 1;
      }
    }

    const notes = input.dryRun
      ? `Dry run found ${weeklyReports.length} high-confidence weekly report(s) from ${classified.length} upload(s).`
      : `Backfill summarized ${summarized} report(s); skipped ${skippedExisting} existing summary row(s).`;

    await supabase
      .from("job_runs")
      .update({
        status: "succeeded",
        notes,
        metadata: {
          trigger: "backfill",
          dryRun: input.dryRun,
          startDate: input.startDate,
          endDate: input.endDate,
          totalVideos: classified.length,
          weeklyReports: weeklyReports.length,
          summarized,
          skippedExisting
        },
        finished_at: new Date().toISOString()
      })
      .eq("id", jobRun.run.id);

    return {
      runKey,
      dryRun: input.dryRun,
      totalVideos: classified.length,
      weeklyReports: weeklyReports.length,
      summarized,
      skippedExisting,
      candidates: classified.map((candidate) => ({
        title: candidate.title,
        publishedAt: candidate.publishedAt,
        url: candidate.url,
        classification: candidate.classification.classification,
        confidence: candidate.classification.confidence,
        action: candidate.classification.recommendedAction
      }))
    };
  } catch (error) {
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        notes: error instanceof Error ? error.message : "Backfill failed.",
        metadata: { trigger: "backfill", dryRun: input.dryRun, startDate: input.startDate, endDate: input.endDate },
        finished_at: new Date().toISOString()
      })
      .eq("id", jobRun.run.id);
    throw error;
  }
}
