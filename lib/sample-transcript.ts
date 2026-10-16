import type { Transcript } from "@/lib/transcript";

/** Built-in desk sample. Edits stay in the browser; nothing is uploaded. */
export const sampleTranscript: Transcript = {
  id: "sample",
  filename: "sample-interview.m4a",
  durationSec: 18,
  engine: "sample",
  createdAt: 0,
  speakers: { "0": "Mayor García" },
  translation: ["But they said no.", "Right?"],
  segments: [
    {
      speaker: 0,
      start: 12,
      end: 16,
      lang: "mixed",
      words: [
        { w: "Pero", lang: "es", start: 12, end: 12.3 },
        { w: "ellos", lang: "es", start: 12.3, end: 12.6 },
        { w: "said", lang: "en", start: 12.6, end: 12.9 },
        { w: "no.", lang: "en", start: 12.9, end: 13.2 },
      ],
    },
    {
      speaker: 1,
      start: 16,
      end: 18,
      lang: "es",
      words: [{ w: "¿Verdad?", lang: "es", start: 16, end: 16.6 }],
    },
  ],
};
