import "server-only";

import { estimateOpenAiCostUsd, estimateSmsCostUsd, estimateTokensFromText, roundMoney, type TokenUsage } from "@/lib/costing";
import { getServerEnv, inspectEnvReadiness } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

export type CostSummaryRow = Tables<"summaries"> & {
  video_title: string;
  video_url: string;
  published_at: string;
  resolved_input_tokens: number;
  resolved_output_tokens: number;
  resolved_total_tokens: number;
  resolved_cost_usd: number;
  estimated: boolean;
};

export type CostData = {
  error: string | null;
  totals: {
    summaries: number;
    estimatedRows: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    openAiCostUsd: number;
    smsSegments: number;
    smsCostUsd: number;
    totalCostUsd: number;
  };
  rows: CostSummaryRow[];
};

const EMPTY_COST_DATA: CostData = {
  error: null,
  totals: {
    summaries: 0,
    estimatedRows: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    openAiCostUsd: 0,
    smsSegments: 0,
    smsCostUsd: 0,
    totalCostUsd: 0
  },
  rows: []
};

export async function getCostData(): Promise<CostData> {
  const readiness = inspectEnvReadiness();
  if (!readiness.serverReady) {
    return { ...EMPTY_COST_DATA, error: "Server environment is not fully configured yet." };
  }

  try {
    const env = getServerEnv();
    const supabase = getSupabaseAdmin();
    const [summariesResult, videosResult, deliveriesResult] = await Promise.all([
      supabase.from("summaries").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("videos").select("id,title,video_url,published_at,transcript_text"),
      supabase.from("sms_deliveries").select("num_segments,price,status")
    ]);

    const error = [summariesResult.error, videosResult.error, deliveriesResult.error].find(Boolean);
    if (error) throw error;

    const videosById = new Map((videosResult.data ?? []).map((video) => [video.id, video]));
    const rows = (summariesResult.data ?? []).map((summary) => {
      const video = videosById.get(summary.video_id);
      const estimatedUsage = estimateUsage(summary, video?.transcript_text ?? "");
      const usage: TokenUsage = {
        inputTokens: summary.input_tokens ?? estimatedUsage.inputTokens,
        outputTokens: summary.output_tokens ?? estimatedUsage.outputTokens,
        totalTokens: summary.total_tokens ?? estimatedUsage.totalTokens
      };
      const cost = typeof summary.estimated_openai_cost_usd === "number" ? summary.estimated_openai_cost_usd : estimateOpenAiCostUsd(usage, env);

      return {
        ...summary,
        video_title: video?.title ?? "Unknown video",
        video_url: video?.video_url ?? "",
        published_at: video?.published_at ?? summary.created_at,
        resolved_input_tokens: usage.inputTokens,
        resolved_output_tokens: usage.outputTokens,
        resolved_total_tokens: usage.totalTokens,
        resolved_cost_usd: roundMoney(cost),
        estimated: summary.total_tokens === null || summary.estimated_openai_cost_usd === null
      };
    });

    const openAiCostUsd = roundMoney(rows.reduce((sum, row) => sum + row.resolved_cost_usd, 0));
    const inputTokens = rows.reduce((sum, row) => sum + row.resolved_input_tokens, 0);
    const outputTokens = rows.reduce((sum, row) => sum + row.resolved_output_tokens, 0);
    const totalTokens = rows.reduce((sum, row) => sum + row.resolved_total_tokens, 0);
    const smsSegments = (deliveriesResult.data ?? []).reduce((sum, delivery) => sum + (delivery.num_segments ?? 0), 0);
    const smsCostUsd = roundMoney(
      (deliveriesResult.data ?? []).reduce((sum, delivery) => {
        if (typeof delivery.price === "number") return sum + Math.abs(delivery.price);
        return sum + estimateSmsCostUsd(delivery.num_segments ?? 0, env.TWILIO_ESTIMATED_SEGMENT_COST_USD);
      }, 0)
    );

    return {
      error: null,
      totals: {
        summaries: rows.length,
        estimatedRows: rows.filter((row) => row.estimated).length,
        inputTokens,
        outputTokens,
        totalTokens,
        openAiCostUsd,
        smsSegments,
        smsCostUsd,
        totalCostUsd: roundMoney(openAiCostUsd + smsCostUsd)
      },
      rows
    };
  } catch (error) {
    return {
      ...EMPTY_COST_DATA,
      error: error instanceof Error ? error.message : "Could not load cost data."
    };
  }
}

function estimateUsage(summary: Tables<"summaries">, transcriptText: string): TokenUsage {
  const outputText = JSON.stringify(summary.summary_json) + "\n" + summary.sms_text;
  const inputTokens = estimateTokensFromText(transcriptText) + 350;
  const outputTokens = estimateTokensFromText(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}
