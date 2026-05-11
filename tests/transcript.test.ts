import { describe, expect, it, vi } from "vitest";
import { fetchTranscript } from "@/lib/transcript";

describe("fetchTranscript", () => {
  it("falls back to YouTube timedtext caption tracks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const value = String(url);
        if (value.includes("watch?v=test-video")) {
          return new Response(
            String.raw`{"captionTracks":[{"baseUrl":"https://example.com/timedtext?v=test-video","languageCode":"en","kind":"asr"}],"audioTracks":[]}`,
            { status: 200 }
          );
        }

        if (value.includes("timedtext")) {
          return new Response("<transcript><text start=\"0\" dur=\"1\">Delta bite &amp; tule edges</text></transcript>", {
            status: 200
          });
        }

        return new Response("", { status: 404 });
      })
    );

    const result = await fetchTranscript("test-video");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.source).toBe("youtube-timedtext");
      expect(result.text).toContain("Delta bite & tule edges");
    }

    vi.unstubAllGlobals();
  });

  it("reads caption tracks from ytInitialPlayerResponse and retries timedtext formats", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const value = String(url);
        calls.push(value);
        if (value.includes("watch?v=player-video")) {
          return new Response(
            String.raw`ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://example.com/timedtext?v=player-video","languageCode":"en","kind":"asr"}]}}};`,
            { status: 200 }
          );
        }

        if (value.includes("timedtext") && value.includes("fmt=json3")) {
          return new Response("", { status: 200 });
        }

        if (value.includes("timedtext") && value.includes("fmt=srv3")) {
          return new Response("<transcript><text start=\"0\" dur=\"1\">Fallback caption text</text></transcript>", {
            status: 200
          });
        }

        return new Response("", { status: 404 });
      })
    );

    const result = await fetchTranscript("player-video");

    expect(result.status).toBe("found");
    expect(calls.some((call) => call.includes("fmt=json3"))).toBe(true);
    expect(calls.some((call) => call.includes("fmt=srv3"))).toBe(true);
    if (result.status === "found") {
      expect(result.text).toContain("Fallback caption text");
    }

    vi.unstubAllGlobals();
  });

  it("falls back to the YouTube transcript panel when timedtext is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const value = String(url);
        if (value.includes("watch?v=panel-video")) {
          return new Response(
            String.raw`"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"2.1","VISITOR_DATA":"visitor","getTranscriptEndpoint":{"params":"abc%3D"}`,
            { status: 200 }
          );
        }

        if (value.includes("timedtext")) {
          return new Response("", { status: 200 });
        }

        if (value.includes("youtubei/v1/get_transcript")) {
          return Response.json({
            actions: [
              {
                updateEngagementPanelAction: {
                  content: {
                    transcriptRenderer: {
                      content: {
                        transcriptSearchPanelRenderer: {
                          body: {
                            transcriptSegmentListRenderer: {
                              initialSegments: [
                                {
                                  transcriptSegmentRenderer: {
                                    snippet: {
                                      runs: [{ text: "First caption line" }]
                                    }
                                  }
                                },
                                {
                                  transcriptSegmentRenderer: {
                                    snippet: {
                                      runs: [{ text: "second caption line" }]
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            ]
          });
        }

        return new Response("", { status: 404 });
      })
    );

    const result = await fetchTranscript("panel-video");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.source).toBe("youtube-transcript-panel");
      expect(result.text).toBe("First caption line second caption line");
    }

    vi.unstubAllGlobals();
  });
});
