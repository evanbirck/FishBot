import { createHash } from "node:crypto";

export type TranscriptResult =
  | {
      status: "found";
      source: "youtube-innertube" | "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel";
      language: string | null;
      text: string;
      hash: string;
    }
  | {
      status: "missing";
      source: "youtube-innertube" | "youtube-transcript" | "youtube-timedtext" | "youtube-transcript-panel";
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

const WATCH_URL = "https://www.youtube.com/watch";
const INNERTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const TRANSCRIPT_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 FishBot transcript fetcher"
];
const TIMEDTEXT_FORMATS = ["json3", "srv3", "ttml", "vtt", ""];
const INNERTUBE_CLIENTS = [
  {
    name: "ANDROID",
    version: "20.10.38",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
    context: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      hl: "en",
      gl: "US",
      androidSdkVersion: 35,
      osName: "Android",
      osVersion: "14"
    }
  },
  {
    name: "IOS",
    version: "20.10.4",
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X; en_US)",
    context: {
      clientName: "IOS",
      clientVersion: "20.10.4",
      hl: "en",
      gl: "US",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iOS",
      osVersion: "17.5"
    }
  }
] as const;

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const errors: string[] = [];

  try {
    return await fetchTranscriptFromInnerTube(videoId);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "YouTube InnerTube captions were unavailable.");
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

  return {
    status: "missing",
    source: "youtube-transcript",
    reason: errors.join(" ")
  };
}

async function fetchTranscriptFromInnerTube(videoId: string): Promise<TranscriptResult> {
  const failures: string[] = [];

  for (const client of INNERTUBE_CLIENTS) {
    const response = await fetchNoStoreWithRetry(INNERTUBE_PLAYER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": client.userAgent,
        "x-youtube-client-name": client.name === "ANDROID" ? "3" : "5",
        "x-youtube-client-version": client.version
      },
      body: JSON.stringify({
        context: {
          client: client.context
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true
      })
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      failures.push(`${client.name} player returned ${response.status}`);
      continue;
    }

    const tracks = extractCaptionTracksFromInnerTubePayload(payload);
    if (!tracks.length) {
      failures.push(`${client.name} player returned no captions${formatPlayabilityReason(payload)}`);
      continue;
    }

    const transcript = await fetchTimedTextFromTracks(tracks, videoId);
    return {
      status: "found",
      source: "youtube-innertube",
      language: transcript.language,
      text: transcript.text,
      hash: createHash("sha256").update(transcript.text).digest("hex")
    };
  }

  throw new Error(failures.join("; ") || "YouTube InnerTube returned no usable caption tracks.");
}

async function fetchTranscriptFromTimedText(videoId: string): Promise<TranscriptResult> {
  const htmlResponse = await fetchWatchPage(videoId);
  if (!htmlResponse.ok) {
    throw new Error(`YouTube watch page returned ${htmlResponse.status}.`);
  }

  const html = await htmlResponse.text();
  const captionTracks = extractCaptionTracks(html);
  const track = chooseCaptionTrack(captionTracks);
  if (!track) {
    throw new Error("No caption tracks were listed on the YouTube watch page.");
  }

  const transcript = await fetchTimedTextFromTracks(captionTracks, videoId);
  return {
    status: "found",
    source: "youtube-timedtext",
    language: transcript.language,
    text: transcript.text,
    hash: createHash("sha256").update(transcript.text).digest("hex")
  };
}

async function fetchTimedTextFromTracks(tracks: CaptionTrack[], videoId: string): Promise<{ text: string; language: string | null }> {
  const orderedTracks = orderCaptionTracks(tracks);
  const failures: string[] = [];

  for (const track of orderedTracks) {
    for (const format of TIMEDTEXT_FORMATS) {
      const url = format ? withTranscriptFormat(track.baseUrl, format) : track.baseUrl;
      const response = await fetchNoStoreWithRetry(url, {
        headers: {
          accept: format === "json3" ? "application/json,text/plain,*/*" : "text/plain,text/html,*/*",
          referer: `${WATCH_URL}?v=${encodeURIComponent(videoId)}`,
          "user-agent": TRANSCRIPT_USER_AGENTS[0]
        }
      });

      if (!response.ok) {
        failures.push(`${track.languageCode ?? "unknown"}/${format || "default"} returned ${response.status}`);
        continue;
      }

      const body = await response.text();
      const text = normalizeTimedTextBody(body);
      if (text) return { text, language: track.languageCode ?? null };
      failures.push(`${track.languageCode ?? "unknown"}/${format || "default"} returned empty text`);
    }
  }

  throw new Error(`YouTube listed captions but timedtext did not return usable text. ${failures.slice(0, 6).join("; ")}`);
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

  const paramVariants = Array.from(new Set([params, safeDecodeURIComponent(params)]));
  const failures: string[] = [];
  for (const transcriptParams of paramVariants) {
    const response = await fetchNoStoreWithRetry(`https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://www.youtube.com",
        referer: `${WATCH_URL}?v=${encodeURIComponent(videoId)}`,
        "user-agent": TRANSCRIPT_USER_AGENTS[0],
        "x-goog-visitor-id": visitorData ?? "",
        "x-youtube-client-name": "1",
        "x-youtube-client-version": clientVersion
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
        params: transcriptParams
      })
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      failures.push(extractYouTubeErrorMessage(payload) ?? `YouTube transcript panel returned ${response.status}.`);
      continue;
    }

    const text = normalizeTranscriptPanelPayload(payload);
    if (text) {
      return {
        status: "found",
        source: "youtube-transcript-panel",
        language: "en",
        text,
        hash: createHash("sha256").update(text).digest("hex")
      };
    }

    failures.push("YouTube transcript panel returned no readable text.");
  }

  throw new Error(failures.join(" "));
}

function fetchWatchPage(videoId: string): Promise<Response> {
  return fetchNoStoreWithRetry(`${WATCH_URL}?v=${encodeURIComponent(videoId)}`, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": TRANSCRIPT_USER_AGENTS[0]
    }
  });
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
  const playerResponseTracks = extractCaptionTracksFromPlayerResponse(html);
  if (playerResponseTracks.length) return playerResponseTracks;

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

function extractCaptionTracksFromPlayerResponse(html: string): CaptionTrack[] {
  const playerResponse = extractJsonAfterMarker(html, "ytInitialPlayerResponse =");
  if (!playerResponse) return [];

  try {
    const payload = JSON.parse(playerResponse) as {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: unknown;
        };
      };
    };
    const tracks = payload.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks.filter(isCaptionTrack) : [];
  } catch {
    return [];
  }
}

function extractCaptionTracksFromInnerTubePayload(payload: unknown): CaptionTrack[] {
  if (typeof payload !== "object" || payload === null) return [];
  const tracks = (payload as {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: unknown;
      };
    };
  }).captions?.playerCaptionsTracklistRenderer?.captionTracks;

  return Array.isArray(tracks) ? tracks.filter(isCaptionTrack) : [];
}

function formatPlayabilityReason(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const playability = (payload as { playabilityStatus?: unknown }).playabilityStatus;
  if (typeof playability !== "object" || playability === null) return "";
  const status = (playability as { status?: unknown }).status;
  const reason = (playability as { reason?: unknown }).reason;
  const parts = [typeof status === "string" ? status : "", typeof reason === "string" ? reason : ""].filter(Boolean);
  return parts.length ? ` (${parts.join(": ")})` : "";
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
  return orderCaptionTracks(tracks)[0] ?? null;
}

function orderCaptionTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  return (
    [
      ...tracks.filter((track) => track.languageCode?.toLowerCase().startsWith("en") && track.kind !== "asr"),
      ...tracks.filter((track) => track.languageCode?.toLowerCase().startsWith("en") && track.kind === "asr"),
      ...tracks.filter((track) => !track.languageCode?.toLowerCase().startsWith("en"))
    ]
  );
}

function normalizeTimedTextBody(body: string): string {
  const jsonText = normalizeTimedTextJson(body);
  if (jsonText) return jsonText;
  const vttText = normalizeWebVtt(body);
  if (vttText) return vttText;
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

function normalizeWebVtt(body: string): string {
  if (!body.includes("WEBVTT")) return "";
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("WEBVTT") && !line.includes("-->") && !/^\d+$/.test(line))
    .join(" ")
    .replace(/<[^>]+>/g, " ")
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

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractJsonAfterMarker(html: string, marker: string): string | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = html.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }

  return null;
}

async function fetchNoStoreWithRetry(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < TRANSCRIPT_USER_AGENTS.length; attempt += 1) {
    const response = await fetchNoStore(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "user-agent": TRANSCRIPT_USER_AGENTS[attempt]
      }
    });

    lastResponse = response;
    if (response.ok) return response;
    if (![403, 429, 500, 502, 503, 504].includes(response.status)) return response;
  }

  return lastResponse ?? fetchNoStore(input, init);
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
