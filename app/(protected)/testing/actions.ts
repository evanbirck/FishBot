"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inspectEnvReadiness } from "@/lib/env";
import { runHistoricalBackfill } from "@/lib/backfill";

export async function runHistoricalBackfillAction(formData: FormData) {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Historical test run is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const dryRun = formData.get("dryRun") === "on";
  const result = await runHistoricalBackfill({ startDate, endDate, dryRun });

  revalidatePath("/testing");
  revalidatePath("/runs");
  revalidatePath("/reports");
  revalidatePath("/costs");

  const params = new URLSearchParams({
    status: "done",
    mode: dryRun ? "dry" : "run",
    videos: String(result.totalVideos),
    weekly: String(result.weeklyReports),
    summarized: String(result.summarized),
    skipped: String(result.skippedExisting)
  });
  redirect(`/testing?${params.toString()}`);
}
