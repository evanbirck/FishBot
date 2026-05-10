import twilio from "twilio";
import { SMS_PROVIDER } from "@/lib/constants";
import type { ReportSummary } from "@/lib/summarize";
import type { ServerEnv } from "@/lib/env";
import { splitSms as splitSmsText } from "@/lib/sms/split-sms";
export { splitSms, normalizeAscii } from "@/lib/sms/split-sms";

export type SmsSendResult = {
  provider: typeof SMS_PROVIDER;
  providerMessageSid: string;
  status: string;
  numSegments: number;
};

export function renderSmsSummary(summary: ReportSummary, videoUrl: string): string {
  const parts = [
    `FishBot: ${summary.headline}`,
    summary.biteStatus ? `- Bite: ${summary.biteStatus}` : "",
    summary.areas.length ? `- Areas: ${summary.areas.slice(0, 5).join(", ")}` : "",
    summary.structure.length ? `- Structure: ${summary.structure.slice(0, 5).join(", ")}` : "",
    summary.tideCurrent.length ? `- Current/tide: ${summary.tideCurrent.slice(0, 5).join(", ")}` : "",
    summary.baits.length ? `- Baits: ${summary.baits.slice(0, 5).join(", ")}` : "",
    summary.gamePlan.length ? `- Game plan: ${summary.gamePlan.slice(0, 3).join("; ")}` : "",
    videoUrl
  ].filter(Boolean);

  return splitSmsText(parts.join("\n"), { maxChunk: 1200 }).join("\n\n");
}

export async function sendSms(env: ServerEnv, to: string, body: string): Promise<SmsSendResult[]> {
  return sendSmsMessages(env, to, splitSmsText(body, { maxChunk: 1200 }));
}

export async function sendSmsMessages(env: ServerEnv, to: string, messages: string[]): Promise<SmsSendResult[]> {
  if (!env.ENABLE_SMS) return [];
  if (!env.TWILIO_FROM_NUMBER && !env.TWILIO_MESSAGING_SERVICE_SID) {
    throw new Error("Twilio sender is not configured.");
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const results: SmsSendResult[] = [];

  for (const chunk of messages) {
    const message = await client.messages.create({
      body: chunk,
      to,
      ...(env.TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
        : { from: env.TWILIO_FROM_NUMBER }),
      ...(env.TWILIO_STATUS_CALLBACK_URL ? { statusCallback: env.TWILIO_STATUS_CALLBACK_URL } : {})
    });

    results.push({
      provider: SMS_PROVIDER,
      providerMessageSid: message.sid,
      status: message.status,
      numSegments: Number(message.numSegments ?? 0)
    });
  }

  return results;
}
