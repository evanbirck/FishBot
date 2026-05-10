import { createHash } from "node:crypto";

export type TranscriptResult =
  | {
      status: "found";
      source: "youtube-transcript";
      language: string | null;
      text: string;
      hash: string;
    }
  | {
      status: "missing";
      source: "youtube-transcript";
      reason: string;
    };

type TranscriptSegment = {
  text?: string;
  duration?: number;
  offset?: number;
};

type YoutubeTranscriptModule = {
  YoutubeTranscript: {
    fetchTranscript(videoId: string): Promise<TranscriptSegment[]>;
  };
};

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    const transcriptModule = (await import("youtube-transcript")) as unknown as YoutubeTranscriptModule;
    const segments = await transcriptModule.YoutubeTranscript.fetchTranscript(videoId);
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
    return {
      status: "missing",
      source: "youtube-transcript",
      reason: error instanceof Error ? error.message : "No public transcript was available."
    };
  }
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
