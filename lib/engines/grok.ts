import type { AppEnv } from "../cf";
import type { EngineAdapter } from "./types";
import { OPENROUTER_AUDIO_FORMAT, countSpeakers, errText, finite, groupWords, readError, segmentsFromPlainText, speakerIndexer, toBase64 } from "./util";

/**
 * Grok speech-to-text, two routes:
 * - "xai" (default): https://api.x.ai/v1/stt, grok-voice-transcribe-2.0, diarize + word timestamps.
 *   REST list price $0.10/hr (https://docs.x.ai/developers/pricing, fetched 2026-10-05). Needs XAI_API_KEY.
 * - "openrouter": x-ai/grok-stt-1.0 via OpenRouter /audio/transcriptions. Text only (no speakers, no word
 *   times), provider returns usage.cost ($0.0000277778/s at 2026-09-28). Needs OPENROUTER_API_KEY.
 * Neither route returns per-word language → fallback tagger.
 */
const XAI_USD_PER_MIN = 0.1 / 60;
const OR_USD_PER_MIN = 0.0000277778 * 60;

const route = (env: Partial<AppEnv>) => ((env.GROK_ROUTE ?? "").trim().toLowerCase() === "openrouter" ? "openrouter" : "xai");

type XaiResponse = { text?: string; duration?: number; words?: { text?: string; start?: number; end?: number; speaker?: number }[] };
type OrResponse = { text?: string; usage?: { seconds?: number; cost?: number }; id?: string };

export const grok: EngineAdapter = {
  id: "grok",
  label: "Grok STT",
  caps: {
    diarization: true,
    wordTimestamps: true,
    languageTags: "none",
    note: "xAI route: diarization + word timestamps, no per-word language. OpenRouter route: text only (one speaker, estimated times). Fallback tagger adds lang.",
  },
  priceSource: "https://docs.x.ai/developers/pricing",
  model: (env) => (route(env) === "xai" ? (env.GROK_MODEL ?? "").trim() || "grok-voice-transcribe-2.0" : "x-ai/grok-stt-1.0"),
  route,
  requiredKeys: (env) => (route(env) === "xai" ? ["XAI_API_KEY"] : ["OPENROUTER_API_KEY"]),
  listUsdPerMin: (env) => (route(env) === "xai" ? XAI_USD_PER_MIN : OR_USD_PER_MIN),
  maxBytes: 25 * 1024 * 1024,
  async transcribe({ audio, mime, format, detectedSec, env, referer, fetchImpl = fetch }) {
    const model = grok.model(env);
    try {
      if (route(env) === "xai") {
        const form = new FormData();
        form.append("model", model);
        form.append("diarize", "true");
        form.append("file", new Blob([audio], { type: mime }), `audio.${format}`);
        const res = await fetchImpl("https://api.x.ai/v1/stt", { method: "POST", headers: { Authorization: `Bearer ${env.XAI_API_KEY}` }, body: form });
        if (!res.ok) return { ok: false, httpStatus: res.status, error: await readError(res, "xAI STT"), cost: null };
        const body = (await res.json()) as XaiResponse;
        const speaker = speakerIndexer();
        const segments = groupWords((body.words || []).map((w) => ({ w: String(w.text || ""), start: Number(w.start || 0), end: Number(w.end || 0), speaker: speaker(w.speaker ?? 0) })));
        const provided = finite(body.duration);
        const durationSec = provided ?? detectedSec;
        return {
          ok: true, httpStatus: res.status, segments, speakers: countSpeakers(segments), durationSec, languageTags: "none", model, requestId: null,
          cost: { usd: (durationSec / 60) * XAI_USD_PER_MIN, source: provided ? "list_price_x_provider_duration" : "list_price_x_detected_duration" },
        };
      }
      const res = await fetchImpl("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": referer, "X-Title": "SwitchQuote" },
        body: JSON.stringify({ model, input_audio: { data: toBase64(audio), format: OPENROUTER_AUDIO_FORMAT[format] || format } }),
      });
      if (!res.ok) return { ok: false, httpStatus: res.status, error: await readError(res, "OpenRouter STT"), cost: null };
      const body = (await res.json()) as OrResponse;
      const provided = finite(body.usage?.seconds);
      const durationSec = provided ?? detectedSec;
      const segments = segmentsFromPlainText(String(body.text || ""), durationSec);
      const providerCost = typeof body.usage?.cost === "number" ? body.usage.cost : null;
      return {
        ok: true, httpStatus: res.status, segments, speakers: 1, durationSec, languageTags: "none", model, requestId: body.id ?? null,
        cost: providerCost !== null ? { usd: providerCost, source: "provider_returned" } : { usd: (durationSec / 60) * OR_USD_PER_MIN, source: provided ? "list_price_x_provider_duration" : "list_price_x_detected_duration" },
      };
    } catch (e) {
      return { ok: false, httpStatus: null, error: errText(e), cost: null };
    }
  },
};
