import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentsFromDeepgram, switchPoints, toJson, toSrt, toTxt, type Transcript } from "./transcript";

const dg = {
  metadata: { duration: 5 },
  results: {
    utterances: [
      {
        start: 0, end: 2, speaker: 0,
        words: [
          { punctuated_word: "Pero", language: "es", start: 0, end: 0.3 },
          { punctuated_word: "ellos", language: "es", start: 0.3, end: 0.6 },
          { punctuated_word: "said", language: "en", start: 0.6, end: 0.9 },
          { punctuated_word: "no.", language: "en", start: 0.9, end: 1.2 },
        ],
      },
      { start: 2, end: 4, speaker: 1, words: [{ punctuated_word: "¿Verdad?", language: "es", start: 2, end: 2.5 }] },
    ],
  },
};

test("parses utterances with per-word language and marks switches", () => {
  const segs = segmentsFromDeepgram(dg);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].words[2].lang, "en");
  assert.deepEqual([...switchPoints(segs)].sort(), ["0:2", "1:0"]);
});

test("exports keep original wording and add EN only when translated", () => {
  const t: Transcript = { id: "x", filename: "a.wav", durationSec: 5, engine: "deepgram/nova-3", createdAt: 0, segments: segmentsFromDeepgram(dg), translation: null };
  assert.match(toTxt(t), /Speaker 1 \(mixed\): Pero ellos said no\./);
  assert.doesNotMatch(toTxt(t), /EN:/);
  assert.match(toSrt(t), /00:00:00,000 --> 00:00:02,000/);
  const j = JSON.parse(toJson({ ...t, translation: ["But they said no.", "Right?"] }));
  assert.equal(j.segments[0].text, "Pero ellos said no.");
  assert.equal(j.segments[0].text_en, "But they said no.");
  assert.deepEqual(Object.keys(j.segments[0]).slice(0, 5), ["speaker", "start", "end", "text", "lang"]);
});

test("docx export is a zip with a document part", async () => {
  const { toDocx } = await import("./docx");
  const { unzipSync, strFromU8 } = await import("fflate");
  const t: Transcript = { id: "x", filename: "a.wav", durationSec: 5, engine: "deepgram/nova-3", createdAt: 0, segments: segmentsFromDeepgram(dg), translation: null };
  const files = unzipSync(toDocx(t));
  assert.ok(files["word/document.xml"]);
  assert.match(strFromU8(files["word/document.xml"]), /Pero/);
  assert.match(strFromU8(files["word/document.xml"]), /w:highlight w:val="yellow"/);
});
