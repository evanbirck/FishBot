import { createHash } from "node:crypto";

export type TranscriptResult =
  | {
      status: "found";
      source: "youtube-transcript" | "youtube-timedtext";
      language: string | null;
      text: string;
      hash: string;
    }
  | {
      status: "missing";
      source: "youtube-transcript" | "youtube-timedtext";
      reason: string;
    };

type TranscriptSegment = {
  text?: string;
  duration?: number;
  offset?: number;
};

type YoutubeTranscriptModule = {
  YoutubeTranscript: {
    fetchTranscript(videoId: string, config?: { fetch?: typeof fetch }): Promise<TranscriptSegment[]>;
  };
};

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const errors: string[] = [];
  try {
    const transcriptModule = (await import("youtube-transcript")) as unknown as YoutubeTranscriptModule;
    const segments = await transcriptModule.YoutubeTranscript.fetchTranscript(videoId, { fetch: fetchNoStore });
    const text = normalizeTranscript(segments);

    if (!text) {
      return {
        status: "missing",
        source: "youtube-transcript",
        reason: "The transcript extractor returned no readable text."
      };
    }

    return {
      status: "found",
      source: "youtube-transcript",
      language: null,
      text,
      hash: createHash("sha256").update(text).digest("hex")
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "youtube-transcript could not read captions.");
  }

  try {
    return await fetchTranscriptFromTimedText(videoId);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "YouTube timedtext captions were unavailable.");
  }

  return {
    status: "missing",
    source: "youtube-timedtext",
    reason: errors.join(" ")
  };
}

async function fetchTranscriptFromTimedText(videoId: string): Promise<TranscriptResult> {
  const htmlResponse = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      "user-agent": "Mozilla/5.0 FishBot transcript fetcher"
    },
    next: { revalidate: 0 }
  } as RequestInit & { next: { revalidate: number } });
  if (!htmlResponse.ok) {
    throw new Error(`YouTube watch page returned ${htmlResponse.status}.`);
  }

  const html = await htmlResponse.text();
  const captionTracks = extractCaptionTracks(html);
  const track = chooseCaptionTrack(captionTracks);
  if (!track) {
    throw new Error("No caption tracks were listed on the YouTube watch page.");
  }

  const transcriptResponse = await fetchNoStore(track.baseUrl);
  if (!transcriptResponse.ok) {
    throw new Error(`YouTube timedtext returned ${transcriptResponse.status}.`);
  }

  const xml = await transcriptResponse.text();
  const text = normalizeTimedTextXml(xml);
  if (!text) {
    throw new Error("YouTube timedtext returned no readable text.");
  }

  return {
    status: "found",
    source: "youtube-timedtext",
    language: track.languageCode ?? null,
    text,
    hash: createHash("sha256").update(text).digest("hex")
  };
}
export function normalizeTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text ?? "")
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: {
    simpleText?: string;
  };
};

function extractCaptionTracks(html: string): CaptionTrack[] {
  const match =
    html.match(/"captionTracks":(\[.*?\]),"audioTracks"/s) ??
    html.match(/"captionTracks":(\[.*?\]),"translationLanguages"/s);
  if (!match?.[1]) return [];

  try {
    const tracks = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(tracks)) return [];
    return tracks.filter(isCaptionTrack);
  } catch {
    return [];
  }
}

function chooseCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return (
    tracks.find((track) => track.languageCode?.toLowerCase().startsWith("en") && track.kind !== "asr") ??
    tracks.find((track) => track.languageCode?.toLowerCase().startsWith("en")) ??
    tracks[0] ??
    null
  );
}

function normalizeTimedTextXml(xml: string): string {
  return Array.from(xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g))
    .map((match) => decodeEntities(match[1] ?? ""))
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

function isCaptionTrack(value: unknown): value is CaptionTrack {
  return typeof value === "object" && value !== null && typeof (value as CaptionTrack).baseUrl === "string";
}

function fetchNoStore(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      ...(init?.headers ?? {})
    },
    next: { revalidate: 0 }
  } as RequestInit & { next: { revalidate: number } });
}
