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
});
