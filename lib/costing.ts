import type { ServerEnv } from "@/lib/env";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function estimateTokensFromText(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateOpenAiCostUsd(
  usage: TokenUsage,
  rates: Pick<ServerEnv, "OPENAI_INPUT_COST_PER_1M" | "OPENAI_OUTPUT_COST_PER_1M">
): number {
  return (usage.inputTokens / 1_000_000) * rates.OPENAI_INPUT_COST_PER_1M + (usage.outputTokens / 1_000_000) * rates.OPENAI_OUTPUT_COST_PER_1M;
}

export function estimateSmsCostUsd(numSegments: number, ratePerSegment: number): number {
  return Math.max(0, numSegments) * ratePerSegment;
}

export function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
