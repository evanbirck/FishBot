import { createHash } from "node:crypto";

export type TranscriptResult =
  | {
      status: "found";
      source: "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel";
      language: string | null;
      text: string;
      hash: string;
    }
  | {
      status: "missing";
      source: "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel";
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

  try {
    return await fetchTranscriptFromTranscriptPanel(videoId);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "YouTube transcript panel captions were unavailable.");
  }

  return {
    status: "missing",
    source: "youtube-transcript-panel",
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

  const transcriptResponse = await fetchNoStore(withTranscriptFormat(track.baseUrl, "json3"), {
    headers: {
      referer: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      "user-agent": "Mozilla/5.0 FishBot transcript fetcher"
    }
  });
  if (!transcriptResponse.ok) {
    throw new Error(`YouTube timedtext returned ${transcriptResponse.status}.`);
  }

  const body = await transcriptResponse.text();
  const text = normalizeTimedTextBody(body);
  if (!text) {
    throw new Error("YouTube listed captions but returned an empty timedtext body.");
  }

  return {
    status: "found",
    source: "youtube-timedtext",
    language: track.languageCode ?? null,
    text,
    hash: createHash("sha256").update(text).digest("hex")
  };
}

async function fetchTranscriptFromTranscriptPanel(videoId: string): Promise<TranscriptResult> {
  const htmlResponse = await fetchWatchPage(videoId);
  const html = await htmlResponse.text();
  const apiKey = extractQuotedValue(html, "INNERTUBE_API_KEY");
  const clientVersion = extractQuotedValue(html, "INNERTUBE_CLIENT_VERSION");
  const visitorData = extractQuotedValue(html, "VISITOR_DATA");
  const params = extractTranscriptPanelParams(html);

  if (!apiKey || !clientVersion || !params) {
    throw new Error("YouTube transcript panel metadata was not available on the watch page.");
  }

  const response = await fetchNoStore(`https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.youtube.com",
      referer: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      "user-agent": "Mozilla/5.0 FishBot transcript fetcher"
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion,
          hl: "en",
          gl: "US",
          visitorData
        }
      },
      params
    })
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = extractYouTubeErrorMessage(payload) ?? `YouTube transcript panel returned ${response.status}.`;
    throw new Error(message);
  }

  const text = normalizeTranscriptPanelPayload(payload);
  if (!text) {
    throw new Error("YouTube transcript panel returned no readable text.");
  }

  return {
    status: "found",
    source: "youtube-transcript-panel",
    language: "en",
    text,
    hash: createHash("sha256").update(text).digest("hex")
  };
}

function fetchWatchPage(videoId: string): Promise<Response> {
  return fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    cache: "no-store",
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "user-agent": "Mozilla/5.0 FishBot transcript fetcher"
    },
    next: { revalidate: 0 }
  } as RequestInit & { next: { revalidate: number } });
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

function extractTranscriptPanelParams(html: string): string | null {
  const match = html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function extractQuotedValue(html: string, key: string): string | null {
  const match = html.match(new RegExp(`"${key}":"([^"]+)"`));
  return match?.[1] ?? null;
}

function chooseCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return (
    tracks.find((track) => track.languageCode?.toLowerCase().startsWith("en") && track.kind !== "asr") ??
    tracks.find((track) => track.languageCode?.toLowerCase().startsWith("en")) ??
    tracks[0] ??
    null
  );
}

function normalizeTimedTextBody(body: string): string {
  const jsonText = normalizeTimedTextJson(body);
  if (jsonText) return jsonText;
  return normalizeTimedTextXml(body);
}

function normalizeTimedTextJson(body: string): string {
  try {
    const payload = JSON.parse(body) as unknown;
    const events = typeof payload === "object" && payload !== null ? (payload as { events?: unknown }).events : null;
    if (!Array.isArray(events)) return "";

    return events
      .flatMap((event) => {
        const segments = typeof event === "object" && event !== null ? (event as { segs?: unknown }).segs : null;
        if (!Array.isArray(segments)) return [];
        return segments.flatMap((segment) => {
          const text = typeof segment === "object" && segment !== null ? (segment as { utf8?: unknown }).utf8 : null;
          return typeof text === "string" ? [text] : [];
        });
      })
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
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

function normalizeTranscriptPanelPayload(payload: unknown): string {
  const texts: string[] = [];
  collectTranscriptPanelText(payload, texts);
  return texts
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTranscriptPanelText(value: unknown, texts: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTranscriptPanelText(item, texts));
    return;
  }

  if (typeof value !== "object" || value === null) return;
  const object = value as Record<string, unknown>;
  const segment = object.transcriptSegmentRenderer;
  if (typeof segment === "object" && segment !== null) {
    const snippet = (segment as { snippet?: unknown }).snippet;
    texts.push(...runsToText(snippet));
  }

  Object.values(object).forEach((item) => collectTranscriptPanelText(item, texts));
}

function runsToText(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const object = value as { simpleText?: unknown; runs?: unknown };
  if (typeof object.simpleText === "string") return [object.simpleText];
  if (!Array.isArray(object.runs)) return [];

  return object.runs.flatMap((run) => {
    if (typeof run !== "object" || run === null) return [];
    const text = (run as { text?: unknown }).text;
    return typeof text === "string" ? [text] : [];
  });
}

function extractYouTubeErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? `YouTube transcript panel returned: ${message}` : null;
}

function withTranscriptFormat(baseUrl: string, format: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", format);
  return url.toString();
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
