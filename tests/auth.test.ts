import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { createAuthToken, AUTH_COOKIE_NAME } from "@/lib/auth/session";
import { isManualRunRequestAuthorized } from "@/lib/auth/manual-run";
import { middleware } from "@/middleware";

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
  CRON_SECRET: "secret",
  ENABLE_SMS: "true",
  APP_BASE_URL: "http://localhost:3000",
  DASHBOARD_PASSWORD: "devmenu"
};

function formRequest(url: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest(url, { method: "POST", body });
}

describe("dashboard authentication", () => {
  it("redirects unauthenticated protected pages to login", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "devmenu");
    const response = await middleware(new NextRequest("http://localhost/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("sets an auth cookie for the correct password", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "devmenu");
    const response = await loginPost(formRequest("http://localhost/api/auth/login", { password: "devmenu", next: "/dashboard" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain(AUTH_COOKIE_NAME);
    expect(response.headers.get("location")).toContain("/dashboard");
  });

  it("returns an error redirect for a wrong password", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "devmenu");
    const response = await loginPost(formRequest("http://localhost/api/auth/login", { password: "wrong", next: "/dashboard" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=invalid");
  });

  it("clears the auth cookie on logout", async () => {
    const response = await logoutPost(new NextRequest("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("allows authenticated protected page requests", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "devmenu");
    const request = new NextRequest("http://localhost/reports");
    request.cookies.set(AUTH_COOKIE_NAME, await createAuthToken("devmenu"));
    const response = await middleware(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not block cron or Twilio webhook routes with dashboard auth", async () => {
    const cron = await middleware(new NextRequest("http://localhost/api/cron/weekly-report"));
    const inbound = await middleware(new NextRequest("http://localhost/api/sms/inbound"));

    expect(cron.headers.get("x-middleware-next")).toBe("1");
    expect(inbound.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps manual run API protected", async () => {
    const request = new NextRequest("http://localhost/api/manual/run", { method: "POST" });

    expect(await isManualRunRequestAuthorized(request, validEnv.CRON_SECRET)).toBe(false);
  });

  it("allows manual run API with CRON_SECRET", async () => {
    const request = new NextRequest("http://localhost/api/manual/run", {
      method: "POST",
      headers: { authorization: `Bearer ${validEnv.CRON_SECRET}` }
    });

    expect(await isManualRunRequestAuthorized(request, validEnv.CRON_SECRET)).toBe(true);
  });
});
