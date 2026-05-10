import { z } from "zod";
import { SUMMARY_PROMPT_VERSION } from "@/lib/constants";
import type { TokenUsage } from "@/lib/costing";
import type { ServerEnv } from "@/lib/env";

export const reportSummarySchema = z.object({
  headline: z.string().min(1),
  biteStatus: z.string().nullable().optional(),
  areas: z.array(z.string()).default([]),
  structure: z.array(z.string()).default([]),
  waterClarity: z.array(z.string()).default([]),
  waterTemperature: z.array(z.string()).default([]),
  tideCurrent: z.array(z.string()).default([]),
  weatherWind: z.array(z.string()).default([]),
  baits: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  presentations: z.array(z.string()).default([]),
  depths: z.array(z.string()).default([]),
  species: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  gamePlan: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"])
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type ReportSummaryResult = {
  summary: ReportSummary;
  usage: TokenUsage | null;
};

type SummarizeInput = {
  title: string;
  publishedAt: string;
  transcriptStatus: "found" | "placeholder";
  transcriptText: string;
  transcriptSource: string;
  videoUrl: string;
};

const SYSTEM_PROMPT =
  "You are an expert California Delta bass fishing report summarizer. Return structured JSON. Include as much useful fishing information as possible from the transcript. Do not invent details. Do not include fields that are not supported by the transcript. Prefer specific tactical details over generic summaries. Avoid repeated information. Keep wording concise enough for SMS rendering.";

const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "biteStatus",
    "areas",
    "structure",
    "waterClarity",
    "waterTemperature",
    "tideCurrent",
    "weatherWind",
    "baits",
    "colors",
    "presentations",
    "depths",
    "species",
    "warnings",
    "gamePlan",
    "confidence"
  ],
  properties: {
    headline: { type: "string" },
    biteStatus: { type: ["string", "null"] },
    areas: { type: "array", items: { type: "string" } },
    structure: { type: "array", items: { type: "string" } },
    waterClarity: { type: "array", items: { type: "string" } },
    waterTemperature: { type: "array", items: { type: "string" } },
    tideCurrent: { type: "array", items: { type: "string" } },
    weatherWind: { type: "array", items: { type: "string" } },
    baits: { type: "array", items: { type: "string" } },
    colors: { type: "array", items: { type: "string" } },
    presentations: { type: "array", items: { type: "string" } },
    depths: { type: "array", items: { type: "string" } },
    species: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    gamePlan: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  }
} as const;

export async function summarizeReport(env: Pick<ServerEnv, "OPENAI_API_KEY" | "OPENAI_SUMMARY_MODEL">, input: SummarizeInput): Promise<ReportSummary> {
  return (await summarizeReportWithUsage(env, input)).summary;
}

export async function summarizeReportWithUsage(
  env: Pick<ServerEnv, "OPENAI_API_KEY" | "OPENAI_SUMMARY_MODEL">,
  input: SummarizeInput
): Promise<ReportSummaryResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_SUMMARY_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserPrompt(input) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "delta_report_summary",
          strict: true,
          schema: SUMMARY_JSON_SCHEMA
        }
      }
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(getOpenAiError(payload));
  }

  return {
    summary: parseSummaryOutput(extractOutputText(payload)),
    usage: extractUsage(payload)
  };
}

export function createPlaceholderSummary(input: {
  title: string;
  publishedAt: string;
  videoUrl: string;
  reason: string;
}): ReportSummary {
  return {
    headline: `Transcript unavailable for ${input.title}`,
    biteStatus: "No public YouTube transcript or captions were available when the job ran.",
    areas: [],
    structure: [],
    waterClarity: [],
    waterTemperature: [],
    tideCurrent: [],
    weatherWind: [],
    baits: [],
    colors: [],
    presentations: [],
    depths: [],
    species: [],
    warnings: [input.reason],
    gamePlan: [
      `Review the video directly: ${input.videoUrl}`
    ],
    confidence: "low"
  };
}

export function parseSummaryOutput(raw: string): ReportSummary {
  const parsed = JSON.parse(raw) as unknown;
  return reportSummarySchema.parse(parsed);
}

export function getPromptVersion(): string {
  return SUMMARY_PROMPT_VERSION;
}

function buildUserPrompt(input: SummarizeInput): string {
  return [
    `Video title: ${input.title}`,
    `Published date: ${input.publishedAt}`,
    `Transcript source/status: ${input.transcriptSource}/${input.transcriptStatus}`,
    `Video URL: ${input.videoUrl}`,
    "",
    "Transcript or placeholder reason:",
    input.transcriptText
  ].join("\n");
}

function extractOutputText(payload: unknown): string {
  if (isRecord(payload) && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (isRecord(payload) && Array.isArray(payload.output)) {
    const text = payload.output
      .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
      .map((content) => {
        if (!isRecord(content)) return "";
        if (typeof content.text === "string") return content.text;
        if (typeof content.output_text === "string") return content.output_text;
        return "";
      })
      .filter(Boolean)
      .join("");

    if (text) return text;
  }

  throw new Error("OpenAI response did not include structured output text.");
}

function getOpenAiError(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return "OpenAI Responses API request failed.";
}

function extractUsage(payload: unknown): TokenUsage | null {
  if (!isRecord(payload) || !isRecord(payload.usage)) return null;
  const inputTokens = numberFromUnknown(payload.usage.input_tokens);
  const outputTokens = numberFromUnknown(payload.usage.output_tokens);
  const totalTokens = numberFromUnknown(payload.usage.total_tokens) ?? (inputTokens ?? 0) + (outputTokens ?? 0);
  if (inputTokens === null && outputTokens === null && totalTokens === 0) return null;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens
  };
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
