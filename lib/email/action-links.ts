import crypto from "node:crypto";
import type { ServerEnv } from "@/lib/env";

const ACTION = "summarize";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function createSummarizeLink(env: Pick<ServerEnv, "APP_BASE_URL" | "EMAIL_ACTION_SECRET" | "CRON_SECRET">, youtubeVideoId: string): string {
  if (!env.APP_BASE_URL) return `/api/videos/${encodeURIComponent(youtubeVideoId)}/summarize`;
  const expires = Date.now() + DEFAULT_TTL_MS;
  const signature = signAction(env, youtubeVideoId, expires);
  const url = new URL(`/api/videos/${encodeURIComponent(youtubeVideoId)}/summarize`, env.APP_BASE_URL);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export function verifySummarizeLink(
  env: Pick<ServerEnv, "EMAIL_ACTION_SECRET" | "CRON_SECRET">,
  youtubeVideoId: string,
  expires: string | null,
  signature: string | null
): boolean {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
  const expected = signAction(env, youtubeVideoId, expiresAt);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function signAction(env: Pick<ServerEnv, "EMAIL_ACTION_SECRET" | "CRON_SECRET">, youtubeVideoId: string, expires: number): string {
  const secret = env.EMAIL_ACTION_SECRET || env.CRON_SECRET;
  return crypto.createHmac("sha256", secret).update(`${ACTION}:${youtubeVideoId}:${expires}`).digest("hex");
}
