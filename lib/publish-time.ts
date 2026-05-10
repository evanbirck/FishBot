type PublishTimeInput = {
  published_at?: string | null;
  publishedAt?: string | null;
};

export function calculateAveragePublishTime(videos: PublishTimeInput[], limit = 8): string | null {
  const minutes = videos
    .slice(0, limit)
    .map((video) => video.published_at ?? video.publishedAt ?? null)
    .map((value) => (value ? new Date(value) : null))
    .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
    .map((date) => date.getUTCHours() * 60 + date.getUTCMinutes());

  if (!minutes.length) return null;

  const average = Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length);
  const hours = Math.floor(average / 60);
  const mins = average % 60;
  const date = new Date(Date.UTC(2026, 0, 1, hours, mins));

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  }).format(date);
}
