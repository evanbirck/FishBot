import { describe, expect, it } from "vitest";
import { formatWeeklyDigest } from "@/lib/sms/format-digest";
import { renderSmsSummary, splitSms } from "@/lib/sms";
import type { ReportSummary } from "@/lib/summarize";

const detailedSummary: ReportSummary = {
  headline: "Delta bite is steady around current breaks",
  biteStatus: "Steady bite with better windows when current is moving",
  areas: ["Franks Tract", "Mildred Island", "main river points"],
  structure: ["tule edges", "sparse grass", "riprap transitions"],
  waterClarity: ["clearer water in protected areas"],
  waterTemperature: ["low 60s"],
  tideCurrent: ["best around current changes"],
  weatherWind: ["windy afternoons"],
  baits: ["Chatterbait", "Senko", "spinnerbait"],
  colors: ["green pumpkin", "white"],
  presentations: ["slow roll reaction baits", "deadstick Senkos"],
  depths: ["2-6 feet"],
  species: ["largemouth", "stripers"],
  warnings: ["avoid muddy windblown banks"],
  gamePlan: ["Start on tule edges with current, then slow down when the tide stalls"],
  confidence: "high"
};

describe("splitSms", () => {
  it("keeps short messages in one chunk", () => {
    expect(splitSms("one\ntwo", { maxChunk: 100 })).toEqual(["one\ntwo"]);
  });

  it("splits long messages cleanly and preserves the final video link", () => {
    const messages = splitSms(["Delta Report:", ...Array.from({ length: 18 }, (_, index) => `- Detail ${index}`), "Video: https://youtu.be/example"].join("\n"), {
      maxChunk: 90,
      finalRequiredLines: ["Video: https://youtu.be/example"]
    });
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.at(-1)).toContain("Video: https://youtu.be/example");
    expect(messages[0]).toMatch(/^Delta Report 1\//);
  });
});

describe("renderSmsSummary", () => {
  it("renders a readable ASCII summary", () => {
    const sms = renderSmsSummary(detailedSummary, "https://youtu.be/example");
    expect(sms).toContain("FishBot:");
    expect(sms).toContain("- Bite:");
    expect(sms).toContain("https://youtu.be/example");
    expect(/[^\x09\x0A\x0D\x20-\x7E]/.test(sms)).toBe(false);
  });
});

describe("formatWeeklyDigest", () => {
  it("renders more than 4 bullets and 8-14 bullets when detail exists", () => {
    const digest = formatWeeklyDigest({
      reportDate: "5/10/2026",
      weeklyReport: { summary: detailedSummary, videoUrl: "https://youtu.be/weekly" }
    });
    const bulletCount = digest.text.split("\n").filter((line) => line.startsWith("- ")).length;
    expect(bulletCount).toBeGreaterThan(4);
    expect(bulletCount).toBeGreaterThanOrEqual(8);
    expect(bulletCount).toBeLessThanOrEqual(14);
  });

  it("omits missing fields and keeps the weekly report link", () => {
    const digest = formatWeeklyDigest({
      weeklyReport: {
        summary: { headline: "Short", areas: [], structure: [], waterClarity: [], waterTemperature: [], tideCurrent: [], weatherWind: [], baits: [], colors: [], presentations: [], depths: [], species: [], warnings: [], gamePlan: [], confidence: "low" },
        videoUrl: "https://youtu.be/weekly"
      }
    });
    expect(digest.text).not.toContain("not mentioned");
    expect(digest.text).toContain("Video: https://youtu.be/weekly");
  });

  it("includes 3+ extra uploads with numbered replies and Reply ALL", () => {
    const digest = formatWeeklyDigest({
      weeklyReport: { summary: detailedSummary, videoUrl: "https://youtu.be/weekly" },
      extraUploads: [
        { optionNumber: 1, title: "Delta topwater", url: "https://youtu.be/a" },
        { optionNumber: 2, title: "Tournament prep", url: "https://youtu.be/b" },
        { optionNumber: 3, title: "Gear check", url: "https://youtu.be/c" }
      ]
    });
    expect(digest.text).toContain("1) Delta topwater - reply YES 1");
    expect(digest.text).toContain("3) Gear check - reply YES 3");
    expect(digest.text).toContain("Reply ALL");
    expect(digest.hasReplyAll).toBe(true);
  });

  it("omits extra uploads section when none exist", () => {
    const digest = formatWeeklyDigest({
      weeklyReport: { summary: detailedSummary, videoUrl: "https://youtu.be/weekly" },
      extraUploads: []
    });
    expect(digest.text).not.toContain("Extra uploads:");
  });

  it("deduplicates extra uploads and avoids Unicode", () => {
    const digest = formatWeeklyDigest({
      extraUploads: [
        { optionNumber: 1, title: "Delta - bait", url: "https://youtu.be/a" },
        { optionNumber: 2, title: "Delta - bait duplicate", url: "https://youtu.be/a" }
      ]
    });
    expect((digest.text.match(/reply YES/g) ?? []).length).toBe(1);
    expect(/[^\x09\x0A\x0D\x20-\x7E]/.test(digest.text)).toBe(false);
  });
});
