import { describe, expect, it } from "vitest";
import { createPlaceholderSummary, parseSummaryOutput, reportSummarySchema } from "@/lib/summarize";

describe("summary validation", () => {
  it("validates structured OpenAI JSON", () => {
    const summary = parseSummaryOutput(
      JSON.stringify({
        headline: "Good current around tule edges",
        biteStatus: "Fish are using current breaks",
        areas: ["Franks Tract"],
        structure: ["sparse grass"],
        waterClarity: ["clearer protected water"],
        waterTemperature: [],
        tideCurrent: ["moving tide matters"],
        weatherWind: [],
        baits: ["Senko"],
        colors: ["green pumpkin"],
        presentations: ["slow"],
        depths: ["2-5 feet"],
        species: ["largemouth"],
        warnings: [],
        gamePlan: ["Fish current breaks first"],
        confidence: "medium"
      })
    );

    expect(summary.headline).toContain("current");
    expect(summary.gamePlan).toContain("Fish current breaks first");
  });

  it("rejects malformed output", () => {
    expect(() => parseSummaryOutput(JSON.stringify({ headline: "missing fields" }))).toThrow();
  });

  it("creates a valid placeholder summary", () => {
    const placeholder = createPlaceholderSummary({
      title: "Weekly California Delta Fishing Report",
      publishedAt: "2026-05-09T16:00:00Z",
      videoUrl: "https://youtu.be/example",
      reason: "No transcript"
    });

    expect(reportSummarySchema.parse(placeholder).confidence).toBe("low");
    expect(placeholder.warnings).toContain("No transcript");
  });
});
