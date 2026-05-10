import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { formatRequestedVideoSummary } from "@/lib/sms/format-digest";
import { normalizeInboundReply, parseInboundReply, resolveReplyOptions } from "@/lib/sms/inbound-replies";
import { sendSmsMessages } from "@/lib/sms";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { validateTwilioSignature } from "@/lib/twilio";
import { createSummaryForVideo, getExistingSummary } from "@/lib/pipeline";
import { reportSummarySchema } from "@/lib/summarize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const formData = await request.formData();
  const payload = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : value.name])
  );

  const callbackUrl = env.APP_BASE_URL ? `${env.APP_BASE_URL}/api/sms/inbound` : "";
  if (callbackUrl) {
    const valid = validateTwilioSignature(env.TWILIO_AUTH_TOKEN, callbackUrl, payload, request.headers.get("x-twilio-signature"));
    if (!valid) return NextResponse.json({ ok: false, error: "Invalid Twilio signature" }, { status: 403 });
  }

  const body = payload.Body ?? "";
  const from = payload.From;
  if (!from) return NextResponse.json({ ok: false, error: "Missing From" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const recipientResult = await supabase.from("recipients").select("*").eq("phone_e164", from).maybeSingle();
  if (recipientResult.error) return NextResponse.json({ ok: false, error: recipientResult.error.message }, { status: 500 });
  if (!recipientResult.data) return twiml();

  const normalized = normalizeInboundReply(body);
  const intent = parseInboundReply(body);

  if (intent.type === "stop") {
    await supabase.from("recipients").update({ active: false }).eq("id", recipientResult.data.id);
    return twiml();
  }

  const pending = await getPendingOptions(recipientResult.data.id);
  const resolved = resolveReplyOptions(intent, pending.map((option) => ({ optionNumber: option.option_number, videoId: option.video.id })));

  if (resolved.type === "not_found") {
    await sendSmsMessages(env, from, ["That option was not found. Reply with a listed number or ALL."]);
    return twiml();
  }

  if (resolved.type === "clarify") {
    await sendSmsMessages(env, from, ["Reply YES 1, YES 2, or ALL to summarize extra uploads."]);
    return twiml();
  }

  if (resolved.type === "ignore") {
    const option = pending.find((item) => item.option_number === resolved.optionNumber);
    if (option) {
      await markOptionIgnored(option, normalized);
    }
    return twiml();
  }

  if (resolved.type !== "approve" && resolved.type !== "approve_all") {
    await sendSmsMessages(env, from, ["Reply YES 1, YES 2, or ALL to summarize extra uploads."]);
    return twiml();
  }

  const selected = resolved.type === "approve_all" ? pending : pending.filter((option) => option.option_number === resolved.optionNumber);

  for (const option of selected) {
    await summarizeApprovedOption(option, normalized, env, from);
  }

  return twiml();
}

async function getPendingOptions(recipientId: string): Promise<Array<Tables<"pending_video_options"> & { video: Tables<"videos"> }>> {
  const supabase = getSupabaseAdmin();
  const pendingResult = await supabase
    .from("pending_video_options")
    .select("*")
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .order("option_number", { ascending: true });

  if (pendingResult.error) throw pendingResult.error;
  const videoIds = (pendingResult.data ?? []).map((option) => option.video_id);
  if (!videoIds.length) return [];

  const videosResult = await supabase.from("videos").select("*").in("id", videoIds);
  if (videosResult.error) throw videosResult.error;
  const videosById = new Map((videosResult.data ?? []).map((video) => [video.id, video]));

  return (pendingResult.data ?? []).flatMap((option) => {
    const video = videosById.get(option.video_id);
    return video ? [{ ...option, video }] : [];
  });
}

async function markOptionIgnored(option: Tables<"pending_video_options"> & { video: Tables<"videos"> }, responseText: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("pending_video_options")
      .update({ status: "ignored", responded_at: now, response_text: responseText })
      .eq("id", option.id),
    supabase
      .from("videos")
      .update({ user_approval_status: "ignored", ignored_at: now })
      .eq("id", option.video.id)
  ]);
}

async function summarizeApprovedOption(
  option: Tables<"pending_video_options"> & { video: Tables<"videos"> },
  responseText: string,
  env: ReturnType<typeof getServerEnv>,
  to: string
) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("pending_video_options")
      .update({ status: "approved", responded_at: now, response_text: responseText })
      .eq("id", option.id),
    supabase
      .from("videos")
      .update({ user_approval_status: "user_approved", approved_at: now })
      .eq("id", option.video.id)
  ]);

  const existing = await getExistingSummary(option.video.id);
  const summary = existing ?? (await createSummaryForVideo(option.video, env));
  const formatted = formatRequestedVideoSummary({
    title: option.video.title,
    summary: reportSummarySchema.parse(summary.summary_json),
    videoUrl: option.video.video_url
  });

  await sendSmsMessages(env, to, formatted.messages);

  await Promise.all([
    supabase
      .from("pending_video_options")
      .update({ status: "summarized" })
      .eq("id", option.id),
    supabase
      .from("videos")
      .update({ user_approval_status: "summarized", summarized_at: new Date().toISOString() })
      .eq("id", option.video.id)
  ]);
}

function twiml() {
  return new NextResponse("<Response></Response>", {
    headers: {
      "Content-Type": "text/xml"
    }
  });
}
