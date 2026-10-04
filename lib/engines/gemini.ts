import type { AppEnv } from "../cf";
import type { Segment } from "../transcript";
import { dominant, normLang } from "../transcript";
import type { EngineAdapter, EngineCost } from "./types";
import { OPENROUTER_AUDIO_FORMAT, errText, readError, speakerIndexer, toBase64, wordsWithEstimatedTimes } from "./util";

/**
 * Gemini as a transcriber (LLM with audio input). We ask for JSON segments whose spans carry a
 * language tag, so switch highlights work without the fallback tagger — but tags and timestamps are
 * model-generated (not acoustic word alignment). Routes:
 * - "openrouter" (default): google/gemini-3.8-flash via OpenRouter chat; usage.cost is the charge. Paid
 *   route, no training on content.
 * - "google": generativelanguage.googleapis.com with GOOGLE_API_KEY. Cost = list price × reported tokens
 *   ($0.75/M input, $3.75/M output incl. thinking through 2026-12-31; doubles 2027-01-01;
 *   https://ai.google.dev/gemini-api/docs/pricing, fetched 2026-10-05). A free-tier key lets Google use
 *   content to improve its products — keep this route off for real users unless the key is billed.
 */
const IN_PER_M = 0.75;
const OUT_PER_M = 3.75;
/** ≈ measured 2026-09-28 smoke: ~1525 input + ~744 output/thinking tokens per audio minute. */
const EST_USD_PER_MIN = (1525 * IN_PER_M + 744 * OUT_PER_M) / 1e6;

const route = (env: Partial<AppEnv>) => ((env.GEMINI_ROUTE ?? "").trim().toLowerCase() === "google" ? "google" : "openrouter");
const baseModel = (env: Partial<AppEnv>) => (env.GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash";

export const GEMINI_PROMPT =
  "Transcribe this interview audio exactly, word for word. Speakers mix Spanish and English (code-switching): " +
  "preserve every word in the language it was spoken. Do not translate, normalize, summarize or drop words. " +
  'Return only JSON: {"segments":[{"speaker":"S1","start":0.0,"end":4.2,"spans":[{"lang":"es","text":"..."},{"lang":"en","text":"..."}]}]}. ' +
  "One segment per speaker turn or sentence; start/end in seconds from the beginning of the audio; " +
  'split each segment into consecutive spans by spoken language using "es", "en" or "other".';

type GemSpan = { lang?: string; text?: string };
type GemSegment = { speaker?: string | number; start?: number; end?: number; spans?: GemSpan[]; text?: string; lang?: string };

/** Parse the model's JSON (tolerates code fences) into normalized segments with span-level languages. */
export function segmentsFromGeminiJson(content: string, durationSec: number): Segment[] {
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as { segments?: GemSegment[] } | GemSegment[];
  const list = Array.isArray(parsed) ? parsed : parsed.segments || [];
  const speaker = speakerIndexer();
  const out: Segment[] = [];
  let prevEnd = 0;
  list.forEach((g, i) => {
    const spans: GemSpan[] = g.spans?.length ? g.spans : [{ lang: g.lang, text: g.text }];
    const text = spans.map((s) => String(s.text || "")).join(" ").trim();
    if (!text) return;
    let start = Number(g.start);
    let end = Number(g.end);
    if (!Number.isFinite(start) || start < prevEnd - 1) start = prevEnd;
    if (!Number.isFinite(end) || end <= start) end = Math.min(durationSec, start + Math.max(1, text.length / 15));
    if (i === list.length - 1 && durationSec > end && durationSec - end < 5) end = durationSec;
    const chars = spans.reduce((n, s) => n + String(s.text || "").length, 0) || 1;
    let cursor = start;
    const words = spans.flatMap((s) => {
      const t = String(s.text || "").trim();
      const spanDur = ((end - start) * t.length) / chars;
      const w = wordsWithEstimatedTimes(t, cursor, cursor + spanDur, normLang(s.lang));
      cursor += spanDur;
      return w;
    });
    out.push({ speaker: speaker(g.speaker ?? "S1"), start, end, lang: dominant(words), words });
    prevEnd = end;
  });
  return out;
}

export const gemini: EngineAdapter = {
  id: "gemini",
  label: "Gemini Flash (audio transcription)",
  caps: {
    diarization: true,
    wordTimestamps: false,
    languageTags: "span-prompted",
    note: "LLM transcription; speakers, segment times and per-span language are model-generated (approximate). Word times are estimated.",
  },
  priceSource: "https://ai.google.dev/gemini-api/docs/pricing",
  model: (env) => (route(env) === "google" ? baseModel(env) : `google/${baseModel(env)}`),
  route,
  requiredKeys: (env) => (route(env) === "google" ? ["GOOGLE_API_KEY"] : ["OPENROUTER_API_KEY"]),
  listUsdPerMin: () => EST_USD_PER_MIN,
  maxBytes: 20 * 1024 * 1024,
  async transcribe({ audio, mime, format, detectedSec, env, referer, fetchImpl = fetch }) {
    const model = gemini.model(env);
    const data = toBase64(audio);
    try {
      let content = "";
      let cost: EngineCost;
      let httpStatus = 0;
      let requestId: string | null = null;
      if (route(env) === "google") {
        const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": String(env.GOOGLE_API_KEY) },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mime, data } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
          }),
        });
        httpStatus = res.status;
        if (!res.ok) return { ok: false, httpStatus: res.status, error: await readError(res, "Gemini"), cost: null };
        const body = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
          responseId?: string;
        };
        content = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
        const u = body.usageMetadata || {};
        const usd = (Number(u.promptTokenCount || 0) * IN_PER_M + (Number(u.candidatesTokenCount || 0) + Number(u.thoughtsTokenCount || 0)) * OUT_PER_M) / 1e6;
        cost = { usd, source: "list_price_x_tokens" };
        requestId = body.responseId ?? null;
      } else {
        const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": referer, "X-Title": "SwitchQuote" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: [{ type: "text", text: GEMINI_PROMPT }, { type: "input_audio", input_audio: { data, format: OPENROUTER_AUDIO_FORMAT[format] || format } }] }],
            response_format: { type: "json_object" },
            reasoning: { effort: "low" },
            usage: { include: true },
            temperature: 0,
          }),
        });
        httpStatus = res.status;
        const body = (await res.json().catch(() => ({}))) as { id?: string; choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
        const providerCost = typeof body.usage?.cost === "number" ? body.usage.cost : null;
        if (!res.ok) {
          return { ok: false, httpStatus: res.status, error: body.error?.message || `OpenRouter ${res.status}`, cost: providerCost !== null ? { usd: providerCost, source: "provider_returned" } : null };
        }
        content = body.choices?.[0]?.message?.content || "";
        cost = providerCost !== null ? { usd: providerCost, source: "provider_returned" } : { usd: (detectedSec / 60) * EST_USD_PER_MIN, source: "list_price_x_detected_duration" };
        requestId = body.id ?? null;
      }
      let segments: Segment[];
      try {
        segments = segmentsFromGeminiJson(content, detectedSec);
      } catch {
        return { ok: false, httpStatus, error: "Gemini returned a transcript that was not valid JSON.", cost };
      }
      if (!segments.length) return { ok: false, httpStatus, error: "Gemini returned an empty transcript.", cost };
      return {
        ok: true, httpStatus, segments, speakers: new Set(segments.map((s) => s.speaker)).size,
        // LLM routes report tokens, not audio length: our header-parsed duration is the audio duration.
        durationSec: detectedSec, languageTags: "span-prompted", model, requestId, cost,
      };
    } catch (e) {
      return { ok: false, httpStatus: null, error: errText(e), cost: null };
    }
  },
};
