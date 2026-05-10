"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env";
import { createSummaryForVideo, createSummaryForVideoWithManualTranscript } from "@/lib/pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function summarizeVideoAction(videoId: string) {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("*").eq("youtube_video_id", videoId).single();
  if (video.error) throw video.error;

  let params: URLSearchParams;
  try {
    await supabase
      .from("videos")
      .update({ user_approval_status: "user_approved", approved_at: new Date().toISOString() })
      .eq("id", video.data.id);
    const summary = await createSummaryForVideo(video.data, env);
    params = new URLSearchParams({
      summary: summary.model === "placeholder" ? "placeholder" : "done"
    });
  } catch (error) {
    params = new URLSearchParams({
      summary: "failed",
      message: getActionErrorMessage(error)
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath(`/reports/${videoId}`);
  redirect(`/reports/${videoId}?${params.toString()}`);
}

export async function summarizeWithManualTranscriptAction(videoId: string, formData: FormData) {
  const transcript = String(formData.get("transcript") ?? "");
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("*").eq("youtube_video_id", videoId).single();
  if (video.error) throw video.error;

  let params: URLSearchParams;
  try {
    await supabase
      .from("videos")
      .update({ user_approval_status: "user_approved", approved_at: new Date().toISOString() })
      .eq("id", video.data.id);
    await createSummaryForVideoWithManualTranscript(video.data, env, transcript);
    params = new URLSearchParams({ summary: "done" });
  } catch (error) {
    params = new URLSearchParams({
      summary: "failed",
      message: getActionErrorMessage(error)
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath(`/reports/${videoId}`);
  redirect(`/reports/${videoId}?${params.toString()}`);
}

export async function ignoreVideoAction(videoId: string) {
  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("id").eq("youtube_video_id", videoId).single();
  if (video.error) throw video.error;

  await supabase
    .from("videos")
    .update({ user_approval_status: "ignored", ignored_at: new Date().toISOString() })
    .eq("id", video.data.id);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath(`/reports/${videoId}`);
}

function getActionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Summary action failed.";
  return message.slice(0, 180);
}
