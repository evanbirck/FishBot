import { NextRequest, NextResponse } from "next/server";
import { verifySummarizeLink } from "@/lib/email/action-links";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { createSummaryForVideo, MissingTranscriptError } from "@/lib/pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SummarizeRouteProps = {
  params: Promise<{
    videoId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: SummarizeRouteProps) {
  const env = getServerEnv();
  const { videoId } = await params;
  const signature = request.nextUrl.searchParams.get("signature");
  const expires = request.nextUrl.searchParams.get("expires");

  if (!verifySummarizeLink(env, videoId, expires, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid or expired summarize link" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const video = await supabase.from("videos").select("*").eq("youtube_video_id", videoId).single();
  if (video.error) {
    return NextResponse.json({ ok: false, error: video.error.message }, { status: 404 });
  }

  try {
    const existingSummary = await supabase.from("summaries").select("id,model").eq("video_id", video.data.id).maybeSingle();
    if (existingSummary.error) throw existingSummary.error;

    if (!existingSummary.data || existingSummary.data.model === "placeholder") {
      await supabase
        .from("videos")
        .update({ user_approval_status: "user_approved", approved_at: new Date().toISOString() })
        .eq("id", video.data.id);
      await createSummaryForVideo(video.data, env, { storePlaceholder: false });
    }

    const redirectUrl = new URL(`/reports/${encodeURIComponent(video.data.youtube_video_id)}`, env.APP_BASE_URL);
    redirectUrl.searchParams.set("summarized", "1");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    if (error instanceof MissingTranscriptError) {
      const redirectUrl = new URL(`/reports/${encodeURIComponent(video.data.youtube_video_id)}`, env.APP_BASE_URL);
      redirectUrl.searchParams.set("summary", "missing");
      redirectUrl.searchParams.set("message", getErrorMessage(error).slice(0, 180));
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
