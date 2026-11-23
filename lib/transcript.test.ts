import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTranscriptEdit, formatQuote, segmentsFromDeepgram, switchPoints, toCsv, toJson, toNvivo, toSrt, toTxt, toVtt, type Transcript } from "./transcript";

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

test("renames, corrections, and pull quotes use the journalist's text", () => {
  const t: Transcript = {
    id: "x",
    filename: "a.wav",
    durationSec: 5,
    engine: "deepgram/nova-3",
    createdAt: 0,
    segments: segmentsFromDeepgram(dg),
    translation: ["But they said no.", "Right?"],
  };
  const named = applyTranscriptEdit(t, { op: "speaker", speaker: 0, name: "  Mayor   García " });
  assert.equal(named.ok, true);
  if (!named.ok) return;
  assert.equal(named.transcript.speakers?.["0"], "Mayor García");
  assert.match(toTxt(named.transcript), /Mayor García \(mixed\): Pero ellos said no\./);
  assert.match(toSrt(named.transcript), /Mayor García: Pero ellos said no\./);
  const exported = JSON.parse(toJson(named.transcript));
  assert.equal(exported.segments[0].speaker, "Mayor García");
  assert.equal(exported.speakers["0"], "Mayor García");
  assert.equal(formatQuote(named.transcript, { si: 0, wi: 3 }, { si: 0, wi: 0 }), "“Pero ellos said no.”\n— Mayor García, 00:00:00");
  assert.equal(
    formatQuote(named.transcript, { si: 0, wi: 2 }, { si: 1, wi: 0 }),
    "Mayor García (00:00:00): “said no.”\nSpeaker 2 (00:00:02): “¿Verdad?”"
  );

  const corrected = applyTranscriptEdit(named.transcript, { op: "word", si: 0, wi: 2, w: " dijo ", lang: "es" });
  assert.equal(corrected.ok, true);
  if (!corrected.ok) return;
  assert.equal(corrected.transcript.segments[0].words[2].w, "dijo");
  assert.equal(corrected.transcript.segments[0].lang, "mixed");
  assert.equal(corrected.transcript.translation?.[0], "");
  assert.equal(corrected.transcript.translation?.[1], "Right?");
  assert.deepEqual([...switchPoints(corrected.transcript.segments)].sort(), ["0:3", "1:0"]);
  assert.equal(t.translation?.[0], "But they said no.");

  const cleared = applyTranscriptEdit(named.transcript, { op: "speaker", speaker: 0, name: " " });
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.transcript.speakers ?? null, null);
  assert.equal(applyTranscriptEdit(t, { op: "speaker", speaker: 0, name: "x".repeat(81) }).ok, false);
  assert.equal(applyTranscriptEdit(t, { op: "word", si: 0, wi: 0, w: " ", lang: "es" }).ok, false);

  const dropped = applyTranscriptEdit(t, { op: "delete_word", si: 1, wi: 0 });
  assert.equal(dropped.ok, true);
  if (!dropped.ok) return;
  assert.equal(dropped.transcript.segments.length, 1);
  assert.deepEqual(dropped.transcript.translation, ["But they said no."]);
});

test("speaker codes, notes, translation edits, and find-replace stay in every export", () => {
  const t: Transcript = { id: "x", filename: "a.wav", durationSec: 5, engine: "deepgram/nova-3", createdAt: 0, segments: segmentsFromDeepgram(dg), translation: ["But they said no.", "Right?"] };
  const named = applyTranscriptEdit(t, { op: "anonymize" });
  assert.equal(named.ok, true);
  if (!named.ok) return;
  assert.equal(named.transcript.speakers?.["0"], "P01");
  assert.equal(named.transcript.speakers?.["1"], "P02");
  const noted = applyTranscriptEdit(named.transcript, { op: "note", si: 0, note: "Fact-check this quote" });
  assert.equal(noted.ok, true);
  if (!noted.ok) return;
  const reviewed = applyTranscriptEdit(noted.transcript, { op: "review_word", si: 0, wi: 2, reviewed: true });
  assert.equal(reviewed.ok, true);
  if (!reviewed.ok) return;
  assert.equal(reviewed.transcript.segments[0].words[2].reviewed, true);
  const replaced = applyTranscriptEdit(reviewed.transcript, { op: "replace", find: "ellos", replacement: "ellas", all: true });
  assert.equal(replaced.ok, true);
  if (!replaced.ok) return;
  assert.equal(replaced.transcript.segments[0].words[1].w, "ellas");
  assert.equal(replaced.transcript.translation?.[0], "");
  const english = applyTranscriptEdit(replaced.transcript, { op: "translation", si: 0, text: "But they said no, the women." });
  assert.equal(english.ok, true);
  if (!english.ok) return;
  const out = english.transcript;
  assert.match(toTxt(out), /P01 \(mixed\): Pero ellas said no\./);
  assert.match(toTxt(out), /langs: es es en\* en/);
  assert.match(toTxt(out), /note: Fact-check this quote/);
  assert.match(toTxt(out), /EN: But they said no, the women\./);
  assert.match(toSrt(out), /P01: Pero ellas said no\./);
  assert.match(toVtt(out), /^WEBVTT/);
  assert.match(toVtt(out), /00:00:00\.000 --> 00:00:02\.000/);
  assert.match(toCsv(out), /start,end,speaker,word,language,confidence,switch_point/);
  assert.match(toCsv(out), /P01,said,en,,true/);
  assert.match(toNvivo(out), /speaker\ttimestamp\tlanguage\ttext/);
  assert.match(toNvivo(out), /P01\t00:00:00\tmixed\tPero ellas said no\. \[note: Fact-check this quote\] \[EN: But they said no, the women\.\]/);
  const json = JSON.parse(toJson(out));
  assert.equal(json.segments[0].note, "Fact-check this quote");
  assert.equal(json.segments[0].words[2].switch_point, true);
  assert.equal(json.segments[0].words[2].reviewed, true);
});
