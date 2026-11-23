import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVerifyFixes, crossCheckSwitchWindows, languagesForSwitches, parseVerifyFixes, switchWindows, usableSuggestion } from "./switch-points";
import { chooseVerifyMode, verifySwitchTranscript } from "./switch-verify";
import type { Segment } from "./transcript";

function seg(words: Segment["words"], speaker = 0): Segment {
  return { speaker, start: words[0]?.start ?? 0, end: words[words.length - 1]?.end ?? 0, lang: "mixed", words };
}

const mixed = seg([
  { w: "Pero", lang: "es", start: 0, end: 0.3, confidence: 0.95 },
  { w: "ellos", lang: "es", start: 0.3, end: 0.6, confidence: 0.91 },
  { w: "said", lang: "en", start: 0.6, end: 0.9, confidence: 0.42 },
  { w: "no.", lang: "en", start: 0.9, end: 1.2, confidence: 0.93 },
]);

test("switch windows mark the code-switch and a low-confidence edge", () => {
  const windows = switchWindows([mixed]);
  assert.ok(windows.some((window) => window.id === "0:2" && window.reason === "code_switch"));
  const boundary = windows.find((window) => window.id === "0:2");
  assert.equal(boundary?.tokens.find((token) => token.wi === 2)?.role, "boundary");
  assert.ok(boundary && boundary.tokens.length >= 3);
});

test("cross-check flags disagreement and does not rewrite the word", () => {
  const secondary = seg([
    { w: "Pero", lang: "es", start: 0, end: 0.3, confidence: 0.99 },
    { w: "ellos", lang: "en", start: 0.3, end: 0.6, confidence: 0.88 },
    { w: "dijo", lang: "es", start: 0.6, end: 0.9, confidence: 0.8 },
    { w: "no.", lang: "en", start: 0.9, end: 1.2, confidence: 0.97 },
  ]);
  const checked = crossCheckSwitchWindows([mixed], [secondary]);
  assert.ok(checked.checked >= 2);
  assert.equal(checked.segments[0].words[2].w, "said");
  assert.equal(checked.segments[0].words[2].lang, "en");
  assert.equal(checked.segments[0].words[2].needsReview, true);
  assert.equal(checked.segments[0].words[2].suggestion?.text, "dijo");
  assert.equal(checked.segments[0].words[1].w, "ellos");
  assert.equal(checked.segments[0].words[1].lang, "es");
  assert.equal(checked.segments[0].words[1].needsReview, true);
  assert.equal(checked.segments[0].words[1].suggestion?.lang, "en");
  assert.equal(checked.segments[0].words[1].confidence, 0.91);
  assert.equal(checked.disagreements, 2);
});

test("cross-check leaves an agreeing switch's words alone", () => {
  const secondary = seg([
    { w: "Pero", lang: "es", start: 0, end: 0.3 },
    { w: "ellos", lang: "es", start: 0.3, end: 0.6 },
    { w: "said", lang: "en", start: 0.6, end: 0.9, confidence: 0.8 },
    { w: "no.", lang: "en", start: 0.9, end: 1.2 },
  ]);
  const checked = crossCheckSwitchWindows([mixed], [secondary]);
  assert.equal(checked.disagreements, 0);
  assert.equal(checked.segments[0].words[2].lang, "en");
  assert.equal(checked.segments[0].words[2].w, "said");
  assert.equal(checked.segments[0].words[2].confidence, 0.42);
});

test("cross-check ignores a secondary word with no time overlap", () => {
  const secondary = seg([{ w: "said", lang: "es", start: 8, end: 9, confidence: 0.2 }]);
  const checked = crossCheckSwitchWindows([mixed], [secondary]);
  assert.equal(checked.checked, 0);
  assert.equal(checked.segments[0].words[2].lang, "en");
});

test("LLM fixes are suggestions and refuse duplicate insertions", () => {
  const fixes = parseVerifyFixes(
    { fixes: [{ si: 0, wi: 2, lang: "es", text: "said said" }, { si: 0, wi: 0, lang: "en" }, { si: 0, wi: 1, text: "Pero" }, { si: 9, wi: 0, lang: "en" }, { si: 0, wi: 3, text: "nope" }] },
    [mixed]
  );
  assert.deepEqual(fixes, [
    { si: 0, wi: 2, lang: "es" },
    { si: 0, wi: 0, lang: "en" },
    { si: 0, wi: 3, text: "nope" },
  ]);
  const applied = applyVerifyFixes([mixed], fixes);
  assert.equal(applied.segments[0].words[2].w, "said");
  assert.equal(applied.segments[0].words[2].lang, "en");
  assert.equal(applied.segments[0].words[2].suggestion?.lang, "es");
  assert.equal(applied.segments[0].words[2].suggestion?.text, undefined);
  assert.equal(applied.segments[0].words[0].lang, "es");
  assert.equal(applied.segments[0].words[0].suggestion?.lang, "en");
  assert.equal(usableSuggestion([mixed], 0, 2, "ellos"), null);
  assert.equal(usableSuggestion([mixed], 0, 2, "dijo"), "dijo");
});

test("verification mode falls back when secondary keys are absent", () => {
  assert.deepEqual(chooseVerifyMode({}, "deepgram"), { mode: "skip", secondaryId: null, llm: null });
  assert.equal(chooseVerifyMode({ DEEPGRAM_API_KEY: "dg" }, "deepgram").mode, "skip");
  assert.equal(chooseVerifyMode({ OPENROUTER_API_KEY: "or" }, "deepgram").mode, "llm");
  assert.equal(chooseVerifyMode({ GOOGLE_API_KEY: "g" }, "assemblyai").llm, "google");
  assert.equal(chooseVerifyMode({ DEEPGRAM_API_KEY: "dg", ASSEMBLYAI_API_KEY: "aa" }, "deepgram").secondaryId, "assemblyai");
  assert.equal(chooseVerifyMode({ DEEPGRAM_API_KEY: "dg", ASSEMBLYAI_API_KEY: "aa", OPENROUTER_API_KEY: "or" }, "gemini").secondaryId, "deepgram");
  assert.equal(chooseVerifyMode({ DEEPGRAM_API_KEY: "  ", ASSEMBLYAI_API_KEY: "aa", OPENROUTER_API_KEY: "or" }, "assemblyai").mode, "llm");
});

test("orchestrator uses the LLM when the cross-check returns nothing", async () => {
  let llmCalled = false;
  const result = await verifySwitchTranscript([mixed], {
    crossCheck: async () => null,
    llm: { provider: "openrouter", apiKey: "test", model: "test-model", referer: "https://switchquote.test", fetchImpl: async () => {
      llmCalled = true;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ fixes: [{ si: 0, wi: 2, lang: "es" }] }) } }], usage: { cost: 0.001 } }), { status: 200 });
    } },
  });
  assert.equal(llmCalled, true);
  assert.equal(result.method, "llm");
  assert.equal(result.segments[0].words[2].w, "said");
  assert.equal(result.segments[0].words[2].lang, "en");
  assert.equal(result.segments[0].words[2].suggestion?.lang, "es");
  assert.equal(result.cost?.usd, 0.001);
  assert.equal(result.model, "test-model");
});

test("orchestrator skips the LLM when the cross-check returns a transcript", async () => {
  let llmCalled = false;
  const result = await verifySwitchTranscript([mixed], {
    crossCheck: async () => [mixed],
    llm: { provider: "google", apiKey: "test", model: "gemini", referer: "https://switchquote.test", fetchImpl: async () => {
      llmCalled = true;
      return new Response("{}", { status: 500 });
    } },
  });
  assert.equal(llmCalled, false);
  assert.equal(result.method, "cross-check");
  assert.equal(result.segments[0].words[2].w, "said");
});

test("a failed LLM call leaves the transcript unchanged", async () => {
  const result = await verifySwitchTranscript([mixed], {
    llm: { provider: "openrouter", apiKey: "test", model: "m", referer: "https://switchquote.test", fetchImpl: async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 429 }) },
  });
  assert.equal(result.method, "skipped");
  assert.equal(result.httpStatus, 429);
  assert.equal(result.segments[0].words[2].lang, "en");
  assert.match(result.error || "", /nope/);
});

test("Deepgram language tags are replaced by the lexical tagger", () => {
  const tagged = languagesForSwitches(
    [seg([
      { w: "Pero", lang: "es", start: 0, end: 0.3 },
      { w: "ellos", lang: "es", start: 0.3, end: 0.6 },
      { w: "said", lang: "es", start: 0.6, end: 0.9 },
      { w: "no.", lang: "es", start: 0.9, end: 1.2 },
    ])],
    "deepgram"
  );
  assert.equal(tagged.method, "lexical");
  assert.equal(tagged.segments[0].words[0].lang, "es");
  assert.equal(tagged.segments[0].words[2].lang, "en");
  assert.equal(tagged.segments[0].words[2].w, "said");
  const kept = languagesForSwitches([mixed], "assemblyai");
  assert.equal(kept.method, "engine");
  assert.equal(kept.segments[0].words[2].lang, "en");
});

test("no switch windows means no verifier call", async () => {
  const plain = seg([{ w: "Hello", lang: "en", start: 0, end: 0.4, confidence: 0.99 }]);
  let called = false;
  const result = await verifySwitchTranscript([plain], {
    crossCheck: async () => {
      called = true;
      return [plain];
    },
  });
  assert.equal(called, false);
  assert.equal(result.method, "skipped");
});
