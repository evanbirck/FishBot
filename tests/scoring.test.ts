import { describe, expect, it, vi } from "vitest";
import { confidenceForScore, scoreReportCandidate } from "@/lib/scoring";

describe("scoreReportCandidate", () => {
  it("scores weekly delta fishing report titles highly", () => {
    vi.setSystemTime(new Date("2026-05-10T00:00:00Z"));
    const result = scoreReportCandidate({
      title: "Weekly Delta Fishing Report 5/9/2026",
      description: "Bass bite and current update from the California Delta.",
      publishedAt: "2026-05-09T16:00:00Z"
    });

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons).toContain("+35 fishing report");
  });

  it("does not require one exact title format", () => {
    vi.setSystemTime(new Date("2026-05-10T00:00:00Z"));
    const result = scoreReportCandidate({
      title: "California Delta fishing report for May - what changed this week",
      description: "A weekly fishing report from Steve Cooper.",
      publishedAt: "2026-05-08T16:00:00Z"
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(confidenceForScore(result.score)).toBe("high");
  });

  it("penalizes unrelated short-form or gear videos", () => {
    vi.setSystemTime(new Date("2026-05-10T00:00:00Z"));
    const result = scoreReportCandidate({
      title: "Delta shorts: gear review trailer",
      description: "A quick technique video.",
      publishedAt: "2026-05-09T16:00:00Z"
    });

    expect(result.score).toBeLessThan(40);
  });
});
