export type InboundReplyIntent =
  | { type: "approve"; optionNumber: number }
  | { type: "approve_all" }
  | { type: "ignore"; optionNumber: number }
  | { type: "stop" }
  | { type: "clarify" }
  | { type: "not_found"; optionNumber?: number };

export type PendingReplyOption = {
  optionNumber: number;
  videoId: string;
  status?: string;
};

export function normalizeInboundReply(body: string): string {
  return body.toUpperCase().trim().replace(/\s+/g, " ");
}

export function parseInboundReply(body: string): InboundReplyIntent {
  const normalized = normalizeInboundReply(body);

  if (normalized === "STOP") return { type: "stop" };
  if (["ALL", "YES ALL", "SUMMARIZE ALL", "REPORT ALL"].includes(normalized)) return { type: "approve_all" };

  const approve = /^(YES|Y|SUMMARIZE|REPORT)\s+(\d+)$/.exec(normalized);
  if (approve) return { type: "approve", optionNumber: Number(approve[2]) };

  const ignore = /^(NO|IGNORE|SKIP)\s+(\d+)$/.exec(normalized);
  if (ignore) return { type: "ignore", optionNumber: Number(ignore[2]) };

  if (/^(YES|Y|SUMMARIZE|REPORT)$/.test(normalized)) return { type: "clarify" };
  return { type: "clarify" };
}

export function resolveReplyOptions(intent: InboundReplyIntent, pendingOptions: PendingReplyOption[]): InboundReplyIntent {
  if (intent.type === "approve_all") {
    return pendingOptions.length ? intent : { type: "not_found" };
  }

  if (intent.type === "approve" || intent.type === "ignore") {
    const exists = pendingOptions.some((option) => option.optionNumber === intent.optionNumber);
    return exists ? intent : { type: "not_found", optionNumber: intent.optionNumber };
  }

  return intent;
}
