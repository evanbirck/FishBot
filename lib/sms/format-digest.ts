import type { ReportSummary } from "@/lib/summarize";
import { normalizeAscii, splitSms } from "@/lib/sms/split-sms";

export type ExtraUploadOption = {
  optionNumber: number;
  title: string;
  url: string;
};

export type WeeklyDigestInput = {
  reportDate?: string | null;
  weeklyReport?: {
    summary: ReportSummary;
    videoUrl: string;
  } | null;
  extraUploads?: ExtraUploadOption[];
  maxChunk?: number;
};

export type FormattedDigest = {
  text: string;
  messages: string[];
  messageCount: number;
  hasReplyAll: boolean;
};

const CATEGORY_RENDERERS: Array<[string, (summary: ReportSummary) => string[]]> = [
  ["Bite", (summary) => arrayFromOptional(summary.biteStatus)],
  ["Areas", (summary) => summary.areas],
  ["Structure", (summary) => summary.structure],
  ["Current/tide", (summary) => summary.tideCurrent],
  ["Water", (summary) => [...summary.waterClarity, ...summary.waterTemperature]],
  ["Weather", (summary) => summary.weatherWind],
  ["Baits", (summary) => summary.baits],
  ["Colors", (summary) => summary.colors],
  ["Retrieve", (summary) => summary.presentations],
  ["Depth", (summary) => summary.depths],
  ["Species", (summary) => summary.species],
  ["Warning", (summary) => summary.warnings],
  ["Game plan", (summary) => summary.gamePlan]
];

export function formatWeeklyDigest(input: WeeklyDigestInput): FormattedDigest {
  const extraUploads = dedupeExtraUploads(input.extraUploads ?? []);
  const lines = input.weeklyReport
    ? weeklyReportLines(input.weeklyReport.summary, input.weeklyReport.videoUrl, input.reportDate)
    : noWeeklyReportLines(extraUploads);

  if (input.weeklyReport && extraUploads.length) {
    lines.push("", "Extra uploads:", ...extraUploadLines(extraUploads), "Reply ALL to summarize all extra uploads.");
  }

  const text = normalizeAscii(lines.join("\n"));
  const messages = splitSms(text, {
    maxChunk: input.maxChunk,
    prefixBase: "Delta Report"
  });

  return {
    text,
    messages,
    messageCount: messages.length,
    hasReplyAll: extraUploads.length > 0
  };
}

export function formatRequestedVideoSummary(input: {
  title: string;
  summary: ReportSummary;
  videoUrl: string;
  maxChunk?: number;
}): FormattedDigest {
  const lines = [`Summary: ${input.title}`, ...summaryBulletLines(input.summary), `Video: ${input.videoUrl}`];
  const text = normalizeAscii(lines.join("\n"));
  const messages = splitSms(text, {
    maxChunk: input.maxChunk,
    prefixBase: "Summary",
    finalRequiredLines: [`Video: ${input.videoUrl}`]
  });

  return {
    text,
    messages,
    messageCount: messages.length,
    hasReplyAll: false
  };
}

function weeklyReportLines(summary: ReportSummary, videoUrl: string, reportDate?: string | null): string[] {
  return [
    `Delta Report${reportDate ? ` ${reportDate}` : ""}:`,
    ...summaryBulletLines(summary),
    "",
    `Video: ${videoUrl}`
  ];
}

function noWeeklyReportLines(extraUploads: ExtraUploadOption[]): string[] {
  if (!extraUploads.length) return ["No clear weekly Delta fishing report was detected."];
  return ["In Deep posted:", ...extraUploadLines(extraUploads), "Reply ALL to summarize all listed videos."];
}

function summaryBulletLines(summary: ReportSummary): string[] {
  const bullets = CATEGORY_RENDERERS.flatMap(([label, getValues]) => {
    const value = compactValues(getValues(summary)).join("; ");
    return value ? [`- ${label}: ${value}`] : [];
  });

  if (bullets.length) return bullets.slice(0, 14);
  return summary.headline ? [`- Bite: ${summary.headline}`] : [];
}

function extraUploadLines(extraUploads: ExtraUploadOption[]): string[] {
  return extraUploads.map((upload) => `${upload.optionNumber}) ${truncateTitle(upload.title)} - reply YES ${upload.optionNumber}`);
}

function compactValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function arrayFromOptional(value?: string | null): string[] {
  return value?.trim() ? [value.trim()] : [];
}

function truncateTitle(title: string, maxLength = 74): string {
  const asciiTitle = normalizeAscii(title).replace(/\s+/g, " ");
  if (asciiTitle.length <= maxLength) return asciiTitle;
  return `${asciiTitle.slice(0, maxLength - 3).trim()}...`;
}

function dedupeExtraUploads(extraUploads: ExtraUploadOption[]): ExtraUploadOption[] {
  const seen = new Set<string>();
  return extraUploads.filter((upload) => {
    const key = upload.url || upload.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
