import { describe, expect, it } from "vitest";
import { normalizeInboundReply, parseInboundReply, resolveReplyOptions } from "@/lib/sms/inbound-replies";

const pending = [
  { optionNumber: 1, videoId: "video-1" },
  { optionNumber: 2, videoId: "video-2" },
  { optionNumber: 3, videoId: "video-3" }
];

describe("inbound SMS replies", () => {
  it("normalizes replies", () => {
    expect(normalizeInboundReply(" yes   12 ")).toBe("YES 12");
  });

  it("YES 1 triggers the correct pending video", () => {
    const intent = resolveReplyOptions(parseInboundReply("YES 1"), pending);
    expect(intent).toEqual({ type: "approve", optionNumber: 1 });
  });

  it("YES with no number asks for clarification", () => {
    expect(parseInboundReply("YES")).toEqual({ type: "clarify" });
  });

  it("YES ALL and ALL approve all pending options", () => {
    expect(resolveReplyOptions(parseInboundReply("YES ALL"), pending)).toEqual({ type: "approve_all" });
    expect(resolveReplyOptions(parseInboundReply("ALL"), pending)).toEqual({ type: "approve_all" });
  });

  it("ALL does not duplicate already summarized videos when none are pending", () => {
    expect(resolveReplyOptions(parseInboundReply("ALL"), [])).toEqual({ type: "not_found" });
  });

  it("invalid numbers return a helpful not-found intent", () => {
    expect(resolveReplyOptions(parseInboundReply("YES 9"), pending)).toEqual({ type: "not_found", optionNumber: 9 });
  });

  it("NO 1 marks the correct video ignored", () => {
    expect(resolveReplyOptions(parseInboundReply("NO 1"), pending)).toEqual({ type: "ignore", optionNumber: 1 });
  });

  it("STOP marks recipient inactive intent", () => {
    expect(parseInboundReply("STOP")).toEqual({ type: "stop" });
  });
});
