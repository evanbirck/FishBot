"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";
import { formatRequestedVideoEmail } from "@/lib/email/format-digest";
import { getServerEnv } from "@/lib/env";
import { createSummaryForVideo } from "@/lib/pipeline";
import { reportSummarySchema } from "@/lib/summarize";
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

export async function emailReportAction(videoId: string) {
  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("*").eq("youtube_video_id", videoId).single();
  if (video.error) throw video.error;

  const summary = await supabase.from("summaries").select("*").eq("video_id", video.data.id).maybeSingle();
  if (summary.error) throw summary.error;

  let params: URLSearchParams;
  try {
    if (!summary.data || summary.data.model === "placeholder") {
      throw new Error("Generate the real summary before emailing this report.");
    }

    const digest = formatRequestedVideoEmail({
      title: video.data.title,
      summary: reportSummarySchema.parse(summary.data.summary_json),
      videoUrl: video.data.video_url
    });
    const queued = await supabase
      .from("email_deliveries")
      .insert({
        summary_id: summary.data.id,
        subject: digest.subject,
        email_to: env.EMAIL_TO,
        email_from: env.EMAIL_FROM || env.GMAIL_SMTP_USER || "FishBot",
        provider: "gmail_smtp",
        status: "queued"
      })
      .select("id")
      .maybeSingle();
    const result = await sendEmail(env, digest);

    if (queued.data?.id) {
      await supabase
        .from("email_deliveries")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status,
          sent_at: result.status === "sent" ? new Date().toISOString() : null
        })
        .eq("id", queued.data.id);
    }

    params = new URLSearchParams({ email: result.status });
  } catch (error) {
    const message = getActionErrorMessage(error);
    await supabase.from("email_deliveries").insert({
      summary_id: summary.data?.id ?? null,
      subject: `FishBot Summary: ${video.data.title}`,
      email_to: env.EMAIL_TO,
      email_from: env.EMAIL_FROM || env.GMAIL_SMTP_USER || "FishBot",
      provider: "gmail_smtp",
      status: "failed",
      error_message: message
    });
    params = new URLSearchParams({
      email: "failed",
      message
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
