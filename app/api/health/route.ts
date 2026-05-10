import { NextResponse } from "next/server";
import { inspectEnvReadiness } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = inspectEnvReadiness();
  let database: { ok: boolean; message: string } = {
    ok: false,
    message: readiness.serverReady ? "Not checked" : "Server environment is incomplete"
  };

  if (readiness.serverReady) {
    try {
      const supabase = getSupabaseAdmin();
      const result = await supabase.from("channels").select("id").limit(1);
      database = result.error
        ? { ok: false, message: result.error.message }
        : { ok: true, message: "Connected" };
    } catch (error) {
      database = { ok: false, message: error instanceof Error ? error.message : "Database check failed" };
    }
  }

  return NextResponse.json({
    ok: readiness.serverReady && database.ok,
    env: readiness,
    database,
    timestamp: new Date().toISOString()
  });
}
