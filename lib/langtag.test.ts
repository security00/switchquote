import { test } from "node:test";
import assert from "node:assert/strict";
import { expandRuns, guessWord, heuristicTag, tagLanguages } from "./langtag";
import type { Segment } from "./transcript";

const seg = (text: string, speaker = 0): Segment => ({ speaker, start: 0, end: 1, lang: "other", words: text.split(" ").map((w) => ({ w, lang: "other", start: 0, end: 0 })) });

test("heuristic: lexicon + orthography, ambiguous words inherit", () => {
  assert.equal(guessWord("¿Qué"), "es");
  assert.equal(guessWord("the"), "en");
  assert.equal(guessWord("no"), null);
  assert.equal(guessWord("2024"), "other");
  const [s] = heuristicTag([seg("Yo trabajo en el hospital but I really like it")]);
  assert.deepEqual(s.words.map((w) => w.lang).slice(0, 4), ["es", "es", "es", "es"]);
  assert.deepEqual(s.words.slice(-4).map((w) => w.lang), ["en", "en", "en", "en"]);
  assert.equal(s.lang, "mixed");
});

test("llm tagger: applies letters, falls back per line on length mismatch, sums provider cost", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"lines":["0s 2e","0e 5s"]}' } }], usage: { cost: 0.0002 } }), { status: 200 })) as typeof fetch;
  const r = await tagLanguages([seg("Hola mi friend"), seg("ok bueno")], { mode: "llm", apiKey: "k", model: "m", referer: "r", fetchImpl });
  assert.deepEqual(r.segments[0].words.map((w) => w.lang), ["es", "es", "en"]);
  assert.equal(r.segments[1].words[1].lang, "es"); // heuristic fallback for the mismatched line
  assert.equal(r.method, "llm+heuristic");
  assert.deepEqual(r.cost, { usd: 0.0002, source: "provider_returned" });
});

test("tagger without key or in heuristic mode makes no paid call", async () => {
  const fetchImpl = (async () => {
    throw new Error("should not be called");
  }) as typeof fetch;
  const r = await tagLanguages([seg("Hola friend")], { mode: "llm", apiKey: undefined, model: "m", referer: "r", fetchImpl });
  assert.equal(r.method, "heuristic");
  assert.equal(r.cost, null);
});

test("expandRuns validates and fills", () => {
  assert.deepEqual(expandRuns("0s 2e", 4), ["es", "es", "en", "en"]);
  assert.deepEqual(expandRuns("0:s, 1:o", 2), ["es", "other"]);
  assert.equal(expandRuns("1s", 3), null);
  assert.equal(expandRuns("0s 0e", 3), null);
  assert.equal(expandRuns("0x", 3), null);
  assert.equal(expandRuns([[0, "s"]], 3), null);
});
