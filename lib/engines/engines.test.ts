import { test } from "node:test";
import assert from "node:assert/strict";
import { ENGINES, chooseEngine, engineStatus, getEngine, listEngines } from "./registry";
import { segmentsFromGeminiJson } from "./gemini";
import { segmentsFromPlainText, groupWords } from "./util";
import type { AppEnv } from "../cf";

const allKeys = { DEEPGRAM_API_KEY: "k", ASSEMBLYAI_API_KEY: "k", OPENROUTER_API_KEY: "k", GOOGLE_API_KEY: "k", XAI_API_KEY: "k", ELEVENLABS_API_KEY: "k" } as Partial<AppEnv>;

test("registry: every adapter satisfies the contract", () => {
  const ids = new Set<string>();
  for (const e of ENGINES) {
    assert.match(e.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.ok(e.model({}).length > 0);
    assert.ok(e.listUsdPerMin({}) > 0 && e.listUsdPerMin({}) < 0.05, `${e.id} price`);
    assert.match(e.priceSource, /^https:\/\//);
    assert.ok(e.requiredKeys({}).length > 0);
    assert.ok(["word", "span-prompted", "none"].includes(e.caps.languageTags));
  }
  assert.deepEqual([...ids], ["deepgram", "assemblyai", "gemini", "grok", "elevenlabs"]);
});

test("missing key → adapter listed but disabled, with key names only", () => {
  const env = { DEEPGRAM_API_KEY: "x", OPENROUTER_API_KEY: "y" } as Partial<AppEnv>;
  const byId = Object.fromEntries(listEngines(env).map((s) => [s.id, s]));
  assert.equal(byId.deepgram.enabled, true);
  assert.equal(byId.gemini.enabled, true); // openrouter route
  assert.equal(byId.grok.enabled, false);
  assert.deepEqual(byId.grok.missingKeys, ["XAI_API_KEY"]);
  assert.deepEqual(byId.elevenlabs.missingKeys, ["ELEVENLABS_API_KEY"]);
  assert.deepEqual(byId.assemblyai.missingKeys, ["ASSEMBLYAI_API_KEY"]);
  assert.equal(engineStatus({ ...env, GROK_ROUTE: "openrouter" }, getEngine("grok")!).enabled, true);
  assert.equal(engineStatus({ ...allKeys, ENGINES_DISABLED: "deepgram" }, getEngine("deepgram")!).enabled, false);
  assert.ok(!JSON.stringify(listEngines(allKeys)).includes('"k"'), "never echoes key values");
});

test("engine choice: config default; only admins override", () => {
  const env = { ...allKeys, STT_ENGINE: "deepgram", ADMIN_EMAILS: "Admin@x.com" } as Partial<AppEnv>;
  const def = chooseEngine(env, "user@x.com", null);
  assert.ok(def.ok && def.engine.id === "deepgram" && !def.overridden);
  const forbidden = chooseEngine(env, "user@x.com", "assemblyai");
  assert.ok(!forbidden.ok && forbidden.status === 403);
  const admin = chooseEngine(env, "admin@x.com", "assemblyai");
  assert.ok(admin.ok && admin.engine.id === "assemblyai" && admin.overridden);
  const unknown = chooseEngine(env, "admin@x.com", "whisper");
  assert.ok(!unknown.ok && unknown.status === 400);
  const disabled = chooseEngine({ ...env, ELEVENLABS_API_KEY: "" }, "admin@x.com", "elevenlabs");
  assert.ok(!disabled.ok && disabled.status === 503 && /ELEVENLABS_API_KEY/.test(disabled.error));
  assert.equal(chooseEngine({ ...allKeys, ADMIN_EMAILS: "" }, "a@x.com", "grok").ok, false);
  const legacy = chooseEngine({ ...allKeys, STT_PROVIDER: "gemini" }, null, null);
  assert.ok(legacy.ok && legacy.engine.id === "gemini");
});

const fakeFetch = (routes: Record<string, unknown>) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected ${url}`);
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

const input = (env: Partial<AppEnv>, fetchImpl: typeof fetch) => ({ audio: new ArrayBuffer(8), mime: "audio/wav", format: "wav" as const, detectedSec: 60, env: env as AppEnv, referer: "https://t", fetchImpl });

test("deepgram adapter keeps per-word language and prices by provider duration", async () => {
  const r = await getEngine("deepgram")!.transcribe(
    input(allKeys, fakeFetch({ "api.deepgram.com": { metadata: { duration: 30, request_id: "r" }, results: { utterances: [{ speaker: 0, start: 0, end: 2, words: [{ punctuated_word: "Hola", language: "es", start: 0, end: 1 }, { punctuated_word: "guys", language: "en", start: 1, end: 2 }] }] } } }))
  );
  assert.ok(r.ok);
  assert.equal(r.languageTags, "word");
  assert.deepEqual(r.segments[0].words.map((w) => w.lang), ["es", "en"]);
  assert.equal(r.cost.source, "list_price_x_provider_duration");
  assert.ok(Math.abs(r.cost.usd - 0.0026) < 1e-9);
});

test("assemblyai adapter: upload → transcript → poll → words with speakers, untagged", async () => {
  const r = await getEngine("assemblyai")!.transcribe(
    input({ ...allKeys, ASSEMBLYAI_POLL_MS: "1" }, fakeFetch({
      "/v2/upload": { upload_url: "u" },
      "/v2/transcript/t1": { id: "t1", status: "completed", audio_duration: 60, words: [{ text: "Hello", start: 0, end: 400, speaker: "A" }, { text: "hola", start: 500, end: 900, speaker: "B" }] },
      "/v2/transcript": { id: "t1", status: "queued" },
    }))
  );
  assert.ok(r.ok);
  assert.equal(r.speakers, 2);
  assert.equal(r.languageTags, "none");
  assert.ok(Math.abs(r.cost.usd - 0.23 / 60) < 1e-9);
});

test("elevenlabs adapter drops spacing tokens and maps speaker ids", async () => {
  const r = await getEngine("elevenlabs")!.transcribe(
    input(allKeys, fakeFetch({ "api.elevenlabs.io": { audio_duration_secs: 60, words: [{ text: "Hola", type: "word", start: 0, end: 0.5, speaker_id: "speaker_1" }, { text: " ", type: "spacing", start: 0.5, end: 0.6 }, { text: "bro", type: "word", start: 0.6, end: 1, speaker_id: "speaker_1" }] } }))
  );
  assert.ok(r.ok);
  assert.equal(r.segments.length, 1);
  assert.deepEqual(r.segments[0].words.map((w) => w.w), ["Hola", "bro"]);
  assert.equal(r.segments[0].speaker, 0);
});

test("grok via openrouter: text only → estimated sentence segments, provider cost", async () => {
  const r = await getEngine("grok")!.transcribe(
    input({ ...allKeys, GROK_ROUTE: "openrouter" }, fakeFetch({ "openrouter.ai/api/v1/audio/transcriptions": { text: "Hola, ¿cómo estás? I'm fine.", usage: { seconds: 60, cost: 0.0016 } } }))
  );
  assert.ok(r.ok);
  assert.equal(r.segments.length, 2);
  assert.deepEqual(r.cost, { usd: 0.0016, source: "provider_returned" });
});

test("gemini JSON spans → per-word language, monotonic times", () => {
  const segs = segmentsFromGeminiJson(
    '```json\n{"segments":[{"speaker":"S1","start":0,"end":4,"spans":[{"lang":"es","text":"Yo trabajo en"},{"lang":"en","text":"the hospital"}]},{"speaker":"S2","start":4,"end":6,"spans":[{"lang":"en","text":"Really?"}]}]}\n```',
    6
  );
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0].words.map((w) => w.lang), ["es", "es", "es", "en", "en"]);
  assert.equal(segs[0].lang, "mixed");
  assert.equal(segs[1].speaker, 1);
  assert.ok(segs[0].words.every((w, i, a) => i === 0 || w.start >= a[i - 1].start));
});

test("util grouping and plain-text estimation", () => {
  const g = groupWords([{ w: "a", start: 0, end: 1, speaker: 0 }, { w: "b", start: 1.2, end: 2, speaker: 0 }, { w: "c", start: 5, end: 6, speaker: 0 }]);
  assert.equal(g.length, 2);
  const p = segmentsFromPlainText("One. Two three.", 10);
  assert.equal(p.length, 2);
  assert.ok(Math.abs(p[1].end - 10) < 1e-9);
});
