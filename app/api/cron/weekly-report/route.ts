import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { runWeeklyReport } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyReport({ trigger: "cron" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
