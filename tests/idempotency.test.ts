import { describe, expect, it } from "vitest";
import { shouldSkipRun, smsDeliveryFingerprint, weeklyRunKey } from "@/lib/idempotency";

describe("idempotency helpers", () => {
  it("creates stable weekly ISO run keys", () => {
    expect(weeklyRunKey(new Date("2026-05-07T16:00:00Z"))).toBe("2026-W19");
  });

  it("skips terminal successful runs only", () => {
    expect(shouldSkipRun({ status: "succeeded" })).toBe(true);
    expect(shouldSkipRun({ status: "skipped" })).toBe(true);
    expect(shouldSkipRun({ status: "failed" })).toBe(false);
    expect(shouldSkipRun(null)).toBe(false);
  });

  it("builds delivery fingerprints from unique constraint inputs", () => {
    expect(smsDeliveryFingerprint("summary", "recipient")).toBe("summary:recipient");
  });
});
