import { describe, expect, it } from "vitest";
import { calculateAveragePublishTime } from "@/lib/publish-time";

describe("calculateAveragePublishTime", () => {
  it("calculates average publish time for recent weekly reports", () => {
    const result = calculateAveragePublishTime([
      { published_at: "2026-05-08T02:00:00Z" },
      { published_at: "2026-05-01T04:00:00Z" }
    ]);

    expect(result).toContain("PM");
  });
});
