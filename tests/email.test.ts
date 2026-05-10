import { describe, expect, it } from "vitest";
import { createSummarizeLink, verifySummarizeLink } from "@/lib/email/action-links";
import { formatWeeklyEmailDigest } from "@/lib/email/format-digest";
import type { ReportSummary } from "@/lib/summarize";

const env = {
  APP_BASE_URL: "https://fishbot.example.com",
  EMAIL_ACTION_SECRET: "email-secret",
  CRON_SECRET: "cron-secret"
};

const detailedSummary: ReportSummary = {
  headline: "Delta bite is improving with moving water.",
  biteStatus: "Best windows are around current changes.",
  areas: ["Franks Tract", "Mildred"],
  structure: ["grass edges", "riprap"],
  waterClarity: ["clearer water is better"],
  waterTemperature: ["mid 60s"],
  tideCurrent: ["outgoing tide"],
  weatherWind: ["watch afternoon wind"],
  baits: ["ChatterBait", "Senko"],
  colors: ["white", "green pumpkin"],
  presentations: ["slow roll", "dead stick"],
  depths: ["2-6 feet"],
  species: ["largemouth"],
  warnings: ["avoid muddy dead-end sloughs"],
  gamePlan: ["start on current-facing grass"],
  confidence: "high"
};

describe("email digest formatting", () => {
  it("renders detailed weekly reports and video links", () => {
    const digest = formatWeeklyEmailDigest({
      reportDate: "5/7/2026",
      weeklyReport: {
        summary: detailedSummary,
        videoUrl: "https://youtu.be/report"
      },
      env
    });

    expect(digest.subject).toContain("FishBot Delta Report");
    expect(digest.text).toContain("- Bite:");
    expect(digest.text).toContain("- Game plan:");
    expect(digest.text).toContain("Video: https://youtu.be/report");
    expect(/[^\x09\x0A\x0D\x20-\x7E]/.test(digest.text)).toBe(false);
  });

  it("adds one-click summarize links for extra uploads", () => {
    const digest = formatWeeklyEmailDigest({
      weeklyReport: null,
      extraUploads: [
        { title: "Gear update", url: "https://youtu.be/gear", youtubeVideoId: "gear123" },
        { title: "Tournament recap", url: "https://youtu.be/tourney", youtubeVideoId: "tour123" },
        { title: "Ostranders strategy", url: "https://youtu.be/extra", youtubeVideoId: "extra123" }
      ],
      env
    });

    expect(digest.text).toContain("1) Gear update");
    expect(digest.text).toContain("2) Tournament recap");
    expect(digest.text).toContain("3) Ostranders strategy");
    expect(digest.text).toContain("/api/videos/gear123/summarize");
    expect(digest.hasActionLinks).toBe(true);
  });
});

describe("email action links", () => {
  it("signs and verifies summarize links", () => {
    const link = createSummarizeLink(env, "abc123");
    const url = new URL(link);

    expect(url.pathname).toBe("/api/videos/abc123/summarize");
    expect(verifySummarizeLink(env, "abc123", url.searchParams.get("expires"), url.searchParams.get("signature"))).toBe(true);
    expect(verifySummarizeLink(env, "other", url.searchParams.get("expires"), url.searchParams.get("signature"))).toBe(false);
  });
});
