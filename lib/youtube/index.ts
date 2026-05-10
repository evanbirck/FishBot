import { confidenceForScore, scoreReportCandidate } from "@/lib/scoring";
import type { ServerEnv } from "@/lib/env";
import { classifyVideoForReport, type VideoClassification } from "@/lib/youtube/classify-video";

export type YouTubeVideoCandidate = {
  videoId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  url: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  classification?: VideoClassification;
};

export type YouTubeChannelInfo = {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
};

type ChannelsListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function resolveUploadsPlaylist(env: Pick<ServerEnv, "YOUTUBE_API_KEY" | "YOUTUBE_CHANNEL_ID">): Promise<YouTubeChannelInfo> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "contentDetails,snippet");
  url.searchParams.set("id", env.YOUTUBE_CHANNEL_ID);
  url.searchParams.set("key", env.YOUTUBE_API_KEY);

  const response = await fetch(url);
  const data = (await response.json()) as ChannelsListResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? "YouTube channels.list request failed.");
  }

  const item = data.items?.[0];
  const uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item?.id || !uploadsPlaylistId) {
    throw new Error("YouTube channel did not include an uploads playlist.");
  }

  return {
    channelId: item.id,
    title: item.snippet?.title ?? "In Deep on the Delta with Steve Cooper",
    uploadsPlaylistId
  };
}

export async function fetchRecentUploads(
  env: Pick<ServerEnv, "YOUTUBE_API_KEY">,
  uploadsPlaylistId: string,
  maxResults = 8
): Promise<YouTubeVideoCandidate[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", env.YOUTUBE_API_KEY);

  const response = await fetch(url);
  const data = (await response.json()) as PlaylistItemsResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? "YouTube playlistItems.list request failed.");
  }

  return playlistItemsToCandidates(data);
}

export async function fetchUploadsInDateRange(
  env: Pick<ServerEnv, "YOUTUBE_API_KEY">,
  uploadsPlaylistId: string,
  startDate: string,
  endDate: string,
  maxVideos = 100
): Promise<YouTubeVideoCandidate[]> {
  const start = dateBoundary(startDate, "start");
  const end = dateBoundary(endDate, "end");
  if (!start || !end || start > end) {
    throw new Error("Enter a valid date range.");
  }

  const candidates: YouTubeVideoCandidate[] = [];
  let pageToken: string | undefined;
  let reachedOlderVideos = false;

  while (!reachedOlderVideos && candidates.length < maxVideos) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", env.YOUTUBE_API_KEY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    const data = (await response.json()) as PlaylistItemsResponse;
    if (!response.ok) {
      throw new Error(data.error?.message ?? "YouTube playlistItems.list request failed.");
    }

    for (const candidate of playlistItemsToCandidates(data)) {
      const publishedAt = new Date(candidate.publishedAt);
      if (Number.isNaN(publishedAt.getTime())) continue;
      if (publishedAt < start) {
        reachedOlderVideos = true;
        continue;
      }
      if (publishedAt <= end) {
        candidates.push(candidate);
        if (candidates.length >= maxVideos) break;
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return candidates.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function discoverLatestReport(env: Pick<ServerEnv, "YOUTUBE_API_KEY" | "YOUTUBE_CHANNEL_ID">) {
  const channel = await resolveUploadsPlaylist(env);
  const candidates = await fetchRecentUploads(env, channel.uploadsPlaylistId);
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const latest = sorted[0];
  if (!latest) {
    throw new Error("No recent uploads were returned by YouTube.");
  }

  return { channel, latest, candidates: sorted };
}

export async function discoverAndClassifyRecentUploads(
  env: Pick<ServerEnv, "YOUTUBE_API_KEY" | "YOUTUBE_CHANNEL_ID" | "OPENAI_API_KEY" | "OPENAI_SUMMARY_MODEL">,
  maxResults = 10
) {
  const channel = await resolveUploadsPlaylist(env);
  const candidates = await fetchRecentUploads(env, channel.uploadsPlaylistId, maxResults);
  const classified = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      classification: await classifyVideoForReport(candidate, {
        openAiApiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_SUMMARY_MODEL
      })
    }))
  );

  return {
    channel,
    candidates: classified.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
  };
}

function playlistItemsToCandidates(data: PlaylistItemsResponse): YouTubeVideoCandidate[] {
  return (data.items ?? [])
    .map((item) => item.snippet)
    .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet?.resourceId?.videoId && snippet.title && snippet.publishedAt))
    .map((snippet) => {
      const videoId = snippet.resourceId?.videoId ?? "";
      const scored = scoreReportCandidate({
        title: snippet.title ?? "",
        description: snippet.description,
        publishedAt: snippet.publishedAt ?? ""
      });

      return {
        videoId,
        title: snippet.title ?? "Untitled upload",
        description: snippet.description ?? null,
        publishedAt: snippet.publishedAt ?? new Date().toISOString(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        score: scored.score,
        confidence: confidenceForScore(scored.score),
        reasons: scored.reasons
      };
    });
}

function dateBoundary(value: string, boundary: "start" | "end"): Date | null {
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}
