import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth/session";
import { fetchTranscript } from "@/lib/transcript";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!(await isAuthenticatedRequest(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const videoId = request.nextUrl.searchParams.get("videoId")?.trim();
  if (!videoId) {
    return NextResponse.json({ ok: false, error: "Missing videoId" }, { status: 400 });
  }

  const startedAt = Date.now();
  const result = await fetchTranscript(videoId);

  return NextResponse.json({
    ok: result.status === "found",
    videoId,
    status: result.status,
    source: result.source,
    length: result.status === "found" ? result.text.length : 0,
    preview: result.status === "found" ? result.text.slice(0, 240) : null,
    reason: result.status === "missing" ? result.reason : null,
    elapsedMs: Date.now() - startedAt
  });
}
