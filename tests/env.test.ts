import { describe, expect, it } from "vitest";
import { inspectEnvReadiness, parseServerEnv } from "@/lib/env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  OPENAI_API_KEY: "openai",
  OPENAI_SUMMARY_MODEL: "gpt-5.4-mini",
  YOUTUBE_API_KEY: "youtube",
  YOUTUBE_CHANNEL_ID: "channel",
  YOUTUBE_CHANNEL_HANDLE: "@handle",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM_NUMBER: "+15555550123",
  TO_PHONE_NUMBER: "+15555550124",
  CRON_SECRET: "secret",
  ENABLE_SMS: "true",
  ENABLE_STT_FALLBACK: "false",
  APP_BASE_URL: "http://localhost:3000",
  DASHBOARD_PASSWORD: "devmenu"
};

describe("env parsing", () => {
  it("parses valid server env", () => {
    const parsed = parseServerEnv(validEnv);
    expect(parsed.ENABLE_SMS).toBe(true);
    expect(parsed.OPENAI_SUMMARY_MODEL).toBe("gpt-5.4-mini");
    expect(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("publishable");
  });

  it("throws on missing required env", () => {
    expect(() => parseServerEnv({})).toThrow(/Server env is invalid/);
  });

  it("reports readiness without exposing values", () => {
    const readiness = inspectEnvReadiness(validEnv);
    expect(readiness.serverReady).toBe(true);
    expect(readiness.serverMissing).toEqual([]);
  });
});
