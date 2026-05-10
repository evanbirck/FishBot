export type JobRunLike = {
  status: "started" | "succeeded" | "failed" | "skipped";
};

export function shouldSkipRun(run: JobRunLike | null | undefined): boolean {
  return run?.status === "succeeded" || run?.status === "skipped";
}

export function weeklyRunKey(date = new Date()): string {
  const { year, week } = getIsoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getIsoWeek(date: Date): { year: number; week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: utc.getUTCFullYear(), week };
}
