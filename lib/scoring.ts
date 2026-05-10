type CandidateInput = {
  title: string;
  description?: string | null;
  publishedAt: string;
};

export type CandidateScore = {
  score: number;
  reasons: string[];
};

const DATE_PATTERN = /\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-]((20)?\d{2})\b/;
const NEGATIVE_PATTERNS = [
  { pattern: /\bshorts?\b/i, points: -25, reason: "short-form upload" },
  { pattern: /\btrailer\b/i, points: -20, reason: "trailer language" },
  { pattern: /\bgear review\b/i, points: -20, reason: "gear review language" },
  { pattern: /\btechnique\b/i, points: -10, reason: "generic technique language" },
  { pattern: /\bpodcast\b/i, points: -10, reason: "podcast language" }
];

const POSITIVE_PATTERNS = [
  { pattern: /\bweekly\b/i, points: 30, reason: "weekly" },
  { pattern: /\bfishing report\b/i, points: 35, reason: "fishing report" },
  { pattern: /\breport\b/i, points: 15, reason: "report" },
  { pattern: /\bdelta\b/i, points: 20, reason: "delta" },
  { pattern: /\bbass\b/i, points: 5, reason: "bass fishing context" },
  { pattern: /\bstriper\b/i, points: 5, reason: "delta fishing context" }
];

export function scoreReportCandidate(input: CandidateInput): CandidateScore {
  const text = `${input.title}\n${input.description ?? ""}`;
  let score = 0;
  const reasons: string[] = [];

  for (const { pattern, points, reason } of POSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += points;
      reasons.push(`+${points} ${reason}`);
    }
  }

  if (DATE_PATTERN.test(text)) {
    score += 10;
    reasons.push("+10 date pattern");
  }

  const daysOld = daysSince(input.publishedAt);
  if (daysOld !== null) {
    if (daysOld <= 10) {
      score += 10;
      reasons.push("+10 recent upload");
    } else if (daysOld <= 21) {
      score += 5;
      reasons.push("+5 moderately recent upload");
    }
  }

  for (const { pattern, points, reason } of NEGATIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += points;
      reasons.push(`${points} ${reason}`);
    }
  }

  return { score: Math.max(0, score), reasons };
}

export function confidenceForScore(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function daysSince(value: string): number | null {
  const published = new Date(value);
  if (Number.isNaN(published.getTime())) return null;
  const diffMs = Date.now() - published.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}
