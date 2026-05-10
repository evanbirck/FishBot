import { createSummarizeLink } from "@/lib/email/action-links";
import type { ServerEnv } from "@/lib/env";
import type { ReportSummary } from "@/lib/summarize";
import { normalizeAscii } from "@/lib/text";

export type ExtraUploadOption = {
  title: string;
  url: string;
  youtubeVideoId: string;
};

export type WeeklyEmailDigestInput = {
  reportDate?: string | null;
  weeklyReport?: {
    summary: ReportSummary;
    videoUrl: string;
  } | null;
  extraUploads?: ExtraUploadOption[];
  env: Pick<ServerEnv, "APP_BASE_URL" | "EMAIL_ACTION_SECRET" | "CRON_SECRET">;
};

export type FormattedEmailDigest = {
  subject: string;
  text: string;
  hasActionLinks: boolean;
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

export function formatWeeklyEmailDigest(input: WeeklyEmailDigestInput): FormattedEmailDigest {
  const extraUploads = dedupeExtraUploads(input.extraUploads ?? []);
  const lines = input.weeklyReport
    ? weeklyReportLines(input.weeklyReport.summary, input.weeklyReport.videoUrl, input.reportDate)
    : noWeeklyReportLines(extraUploads, input.env);

  if (input.weeklyReport && extraUploads.length) {
    lines.push("", "Extra uploads:", ...extraUploadLines(extraUploads, input.env));
  }

  return {
    subject: input.weeklyReport ? `FishBot Delta Report${input.reportDate ? ` ${input.reportDate}` : ""}` : "FishBot Uploads Need Review",
    text: normalizeAscii(lines.join("\n")),
    hasActionLinks: extraUploads.length > 0
  };
}

export function formatRequestedVideoEmail(input: {
  title: string;
  summary: ReportSummary;
  videoUrl: string;
}): FormattedEmailDigest {
  const text = normalizeAscii([`FishBot summary: ${input.title}`, "", ...summaryBulletLines(input.summary), "", `Video: ${input.videoUrl}`].join("\n"));
  return {
    subject: `FishBot Summary: ${truncateTitle(input.title, 60)}`,
    text,
    hasActionLinks: false
  };
}

function weeklyReportLines(summary: ReportSummary, videoUrl: string, reportDate?: string | null): string[] {
  return [`FishBot Delta Report${reportDate ? ` ${reportDate}` : ""}:`, "", ...summaryBulletLines(summary), "", `Video: ${videoUrl}`];
}

function noWeeklyReportLines(extraUploads: ExtraUploadOption[], env: WeeklyEmailDigestInput["env"]): string[] {
  if (!extraUploads.length) return ["No clear weekly Delta fishing report was detected."];
  return ["In Deep posted new uploads that are not clearly weekly reports.", "", ...extraUploadLines(extraUploads, env)];
}

function summaryBulletLines(summary: ReportSummary): string[] {
  const bullets = CATEGORY_RENDERERS.flatMap(([label, getValues]) => {
    const value = compactValues(getValues(summary)).join("; ");
    return value ? [`- ${label}: ${value}`] : [];
  });

  if (bullets.length) return bullets.slice(0, 14);
  return summary.headline ? [`- Bite: ${summary.headline}`] : [];
}

function extraUploadLines(extraUploads: ExtraUploadOption[], env: WeeklyEmailDigestInput["env"]): string[] {
  return extraUploads.flatMap((upload, index) => [
    `${index + 1}) ${truncateTitle(upload.title)}`,
    `   Video: ${upload.url}`,
    `   Summarize: ${createSummarizeLink(env, upload.youtubeVideoId)}`
  ]);
}

function compactValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function arrayFromOptional(value?: string | null): string[] {
  return value?.trim() ? [value.trim()] : [];
}

function truncateTitle(title: string, maxLength = 96): string {
  const asciiTitle = normalizeAscii(title).replace(/\s+/g, " ");
  if (asciiTitle.length <= maxLength) return asciiTitle;
  return `${asciiTitle.slice(0, maxLength - 3).trim()}...`;
}

function dedupeExtraUploads(extraUploads: ExtraUploadOption[]): ExtraUploadOption[] {
  const seen = new Set<string>();
  return extraUploads.filter((upload) => {
    const key = upload.youtubeVideoId || upload.url || upload.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
