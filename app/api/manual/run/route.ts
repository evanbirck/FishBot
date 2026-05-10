import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { runWeeklyReport } from "@/lib/pipeline";
import { isManualRunRequestAuthorized } from "@/lib/auth/manual-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const env = getServerEnv();

  if (!(await isManualRunRequestAuthorized(request, env.CRON_SECRET))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyReport({ trigger: "manual" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
