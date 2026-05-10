"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { getServerEnv, inspectEnvReadiness } from "@/lib/env";
import { runHistoricalBackfill } from "@/lib/backfill";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function sendTestEmailAction() {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    throw new Error(`Test email is unavailable until required server environment variables are configured: ${readiness.serverMissing.join(", ")}`);
  }

  const env = getServerEnv();
  const supabase = getSupabaseAdmin();
  const subject = `FishBot test email - ${new Date().toLocaleString("en-US")}`;
  const text = [
    "FishBot test email",
    "",
    "If you received this, Gmail SMTP is configured correctly.",
    `To: ${env.EMAIL_TO}`,
    `App: ${env.APP_BASE_URL}`
  ].join("\n");

  let deliveryId: string | null = null;
  const queued = await supabase
    .from("email_deliveries")
    .insert({
      subject,
      email_to: env.EMAIL_TO,
      email_from: env.EMAIL_FROM || env.GMAIL_SMTP_USER || "FishBot",
      provider: "gmail_smtp",
      status: "queued"
    })
    .select("id")
    .maybeSingle();
  if (queued.data?.id) deliveryId = queued.data.id;

  const params = new URLSearchParams();
  try {
    const result = await sendEmail(env, { subject, text });
    if (deliveryId) {
      await supabase
        .from("email_deliveries")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status,
          sent_at: result.status === "sent" ? new Date().toISOString() : null
        })
        .eq("id", deliveryId);
    }
    params.set("email", result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test email failed.";
    if (deliveryId) {
      await supabase
        .from("email_deliveries")
        .update({
          status: "failed",
          error_message: message
        })
        .eq("id", deliveryId);
    }
    params.set("email", "failed");
    params.set("message", message.slice(0, 180));
  }

  revalidatePath("/testing");
  revalidatePath("/dashboard");
  redirect(`/testing?${params.toString()}`);
}
