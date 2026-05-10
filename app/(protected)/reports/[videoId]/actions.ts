"use server";

import { revalidatePath } from "next/cache";
import { getServerEnv } from "@/lib/env";
import { createSummaryForVideo } from "@/lib/pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function summarizeVideoAction(videoId: string) {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("*").eq("youtube_video_id", videoId).single();
  if (video.error) throw video.error;

  await supabase
    .from("videos")
    .update({ user_approval_status: "user_approved", approved_at: new Date().toISOString() })
    .eq("id", video.data.id);
  await createSummaryForVideo(video.data, env);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath(`/reports/${videoId}`);
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
