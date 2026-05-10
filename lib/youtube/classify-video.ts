import { z } from "zod";

export type VideoClassification = {
  classification: "weekly_report" | "possible_report" | "extra_upload" | "ignored";
  isWeeklyReport: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
  reason: string;
  recommendedAction: "auto_summarize" | "ask_user" | "ignore";
};

export type ClassifiableVideo = {
  title: string;
  description?: string | null;
  publishedAt?: string | null;
};

type ClassifyOptions = {
  openAiApiKey?: string;
  model?: string;
};

const classificationSchema = z.object({
  classification: z.enum(["weekly_report", "possible_report", "extra_upload", "ignored"]),
  isWeeklyReport: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  score: z.number(),
  reason: z.string().min(1),
  recommendedAction: z.enum(["auto_summarize", "ask_user", "ignore"])
});

const OPENAI_CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classification", "isWeeklyReport", "confidence", "score", "reason", "recommendedAction"],
  properties: {
    classification: { type: "string", enum: ["weekly_report", "possible_report", "extra_upload", "ignored"] },
    isWeeklyReport: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    score: { type: "number" },
    reason: { type: "string" },
    recommendedAction: { type: "string", enum: ["auto_summarize", "ask_user", "ignore"] }
  }
} as const;

const positiveRules = [
  { pattern: /\bweekly\b/i, points: 30, reason: "weekly" },
  { pattern: /\bfishing report\b/i, points: 35, reason: "fishing report" },
  { pattern: /\bcalifornia delta\b/i, points: 20, reason: "California Delta" },
  { pattern: /\bdelta\b/i, points: 15, reason: "Delta" },
  { pattern: /\btournament\b/i, points: 8, reason: "tournament" },
  { pattern: /\bin deep\b/i, points: 10, reason: "In Deep" },
  { pattern: /\breport\b/i, points: 10, reason: "report" },
  { pattern: /\b(this week|week of|weekly update)\b/i, points: 10, reason: "week wording" },
  { pattern: /\bthursday\b/i, points: 8, reason: "Thursday" },
  { pattern: /\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-]((20)?\d{2})\b/i, points: 8, reason: "date" }
];

const negativeRules = [
  { pattern: /\bshorts?\b/i, points: -45, reason: "shorts" },
  { pattern: /\blive\b/i, points: -25, reason: "live" },
  { pattern: /\bannouncement\b/i, points: -25, reason: "announcement" },
  { pattern: /\bgear\b/i, points: -25, reason: "gear" },
  { pattern: /\bgiveaway\b/i, points: -35, reason: "giveaway" },
  { pattern: /\bpodcast\b/i, points: -30, reason: "podcast" },
  { pattern: /\bguide trip\b/i, points: -25, reason: "guide trip" },
  { pattern: /\brecap\b/i, points: -20, reason: "recap" },
  { pattern: /\bsale\b/i, points: -35, reason: "sale" }
];

export async function classifyVideoForReport(
  video: ClassifiableVideo,
  options: ClassifyOptions = {}
): Promise<VideoClassification> {
  const deterministic = classifyDeterministically(video);

  const openAiApiKey = options.openAiApiKey;
  if (deterministic.confidence === "medium" && openAiApiKey) {
    try {
      return await classifyWithOpenAI(video, deterministic, { ...options, openAiApiKey });
    } catch {
      return deterministic;
    }
  }

  return deterministic;
}

export function classifyVideoForReportDeterministic(video: ClassifiableVideo): VideoClassification {
  return classifyDeterministically(video);
}

function classifyDeterministically(video: ClassifiableVideo): VideoClassification {
  const title = video.title.trim();
  const text = `${title}\n${video.description ?? ""}`;
  const lower = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const rule of positiveRules) {
    if (rule.pattern.test(text)) {
      score += rule.points;
      reasons.push(`+${rule.points} ${rule.reason}`);
    }
  }

  for (const rule of negativeRules) {
    if (rule.pattern.test(text)) {
      score += rule.points;
      reasons.push(`${rule.points} ${rule.reason}`);
    }
  }

  if (/\bupdate\b/i.test(text) && !/\bfishing report\b/i.test(text)) {
    score -= 15;
    reasons.push("-15 update without fishing report");
  }

  const hasWeeklyFishingReport = /\bweekly\b/i.test(title) && /\bfishing report\b/i.test(title);
  const hasDeltaFishingContext = /\b(delta|california delta|fishing|bass|striper)\b/i.test(lower);
  const hasHardIgnore = /\b(shorts?|sale|giveaway|podcast)\b/i.test(lower);

  if (!hasHardIgnore && (hasWeeklyFishingReport || score >= 78)) {
    return {
      classification: "weekly_report",
      isWeeklyReport: true,
      confidence: "high",
      score,
      reason: reasons.join("; ") || "Title clearly matches normal weekly report",
      recommendedAction: "auto_summarize"
    };
  }

  if (hasHardIgnore || (!hasDeltaFishingContext && score <= 10)) {
    return {
      classification: "ignored",
      isWeeklyReport: false,
      confidence: "low",
      score,
      reason: reasons.join("; ") || "Upload does not appear to be a California Delta fishing report",
      recommendedAction: "ignore"
    };
  }

  if (score >= 38 && hasDeltaFishingContext) {
    return {
      classification: "possible_report",
      isWeeklyReport: false,
      confidence: "medium",
      score,
      reason: reasons.join("; ") || "Delta-related upload but not clearly the normal weekly report",
      recommendedAction: "ask_user"
    };
  }

  return {
    classification: "extra_upload",
    isWeeklyReport: false,
    confidence: score > 10 ? "medium" : "low",
    score,
    reason: reasons.join("; ") || "Channel upload is not clearly the normal weekly report",
    recommendedAction: "ask_user"
  };
}

async function classifyWithOpenAI(
  video: ClassifiableVideo,
  fallback: VideoClassification,
  options: Required<Pick<ClassifyOptions, "openAiApiKey">> & ClassifyOptions
): Promise<VideoClassification> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are classifying a YouTube upload from the channel In Deep On The Delta. Determine whether this is the channel's normal weekly California Delta fishing report or a different type of video. Return strict JSON with classification, isWeeklyReport, confidence, score, reason, and recommendedAction. Do not summarize the video."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Title: ${video.title}`,
                `Published: ${video.publishedAt ?? "unknown"}`,
                `Description: ${video.description ?? ""}`,
                `Deterministic result: ${JSON.stringify(fallback)}`
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "video_classification",
          strict: true,
          schema: OPENAI_CLASSIFICATION_SCHEMA
        }
      }
    })
  });

  if (!response.ok) return fallback;
  const payload = (await response.json()) as { output_text?: string };
  if (!payload.output_text) return fallback;
  return normalizeClassification(classificationSchema.parse(JSON.parse(payload.output_text)));
}

function normalizeClassification(classification: VideoClassification): VideoClassification {
  if (classification.classification === "weekly_report" && classification.confidence === "high") {
    return { ...classification, isWeeklyReport: true, recommendedAction: "auto_summarize" };
  }
  if (classification.classification === "ignored") {
    return { ...classification, isWeeklyReport: false, recommendedAction: "ignore" };
  }
  return { ...classification, isWeeklyReport: false, recommendedAction: "ask_user" };
}
