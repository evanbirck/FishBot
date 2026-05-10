import { describe, expect, it } from "vitest";
import { classifyVideoForReportDeterministic } from "@/lib/youtube/classify-video";

describe("classifyVideoForReport", () => {
  it("auto-summarizes a clear weekly report title", () => {
    const result = classifyVideoForReportDeterministic({
      title: "Weekly California Delta Fishing Report 5/9/2026",
      description: "In Deep on the Delta Thursday report."
    });

    expect(result.classification).toBe("weekly_report");
    expect(result.confidence).toBe("high");
    expect(result.recommendedAction).toBe("auto_summarize");
  });

  it("does not auto-summarize gear, tournament, or announcement videos", () => {
    const gear = classifyVideoForReportDeterministic({
      title: "Delta gear update and tournament announcement",
      description: "New rod setup, sale details, and tournament recap."
    });

    expect(gear.recommendedAction).not.toBe("auto_summarize");
    expect(gear.isWeeklyReport).toBe(false);
  });

  it("includes unclear Delta-related uploads as optional summary requests", () => {
    const result = classifyVideoForReportDeterministic({
      title: "California Delta current and bait changes this week",
      description: "In Deep discusses fishing conditions and bait changes."
    });

    expect(["possible_report", "extra_upload"]).toContain(result.classification);
    expect(result.recommendedAction).toBe("ask_user");
  });

  it("keeps unrelated uploads from being summarized by cron", () => {
    const result = classifyVideoForReportDeterministic({
      title: "Shorts giveaway sale announcement",
      description: "No fishing report here."
    });

    expect(result.classification).toBe("ignored");
    expect(result.recommendedAction).toBe("ignore");
  });
});
