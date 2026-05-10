"use server";

import { revalidatePath } from "next/cache";
import { inspectEnvReadiness } from "@/lib/env";
import { runWeeklyReport } from "@/lib/pipeline";

export async function triggerManualRunAction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Manual dashboard runs are disabled in production. Use the protected API route with CRON_SECRET.");
  }

  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Manual run is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  await runWeeklyReport({ trigger: "manual" });
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}
