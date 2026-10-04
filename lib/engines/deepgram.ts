import type { DeepgramResponse } from "../transcript";
import { segmentsFromDeepgram } from "../transcript";
import type { EngineAdapter } from "./types";
import { countSpeakers, errText, finite, readError } from "./util";

/** Nova-3 Multilingual pre-recorded, pay-as-you-go (diarization included). https://deepgram.com/pricing, fetched 2026-10-05. */
const LIST_USD_PER_MIN = 0.0052;

export const deepgram: EngineAdapter = {
  id: "deepgram",
  label: "Deepgram Nova-3 (multi)",
  caps: { diarization: true, wordTimestamps: true, languageTags: "word", note: "Per-word language from language=multi; diarization + utterances." },
  priceSource: "https://deepgram.com/pricing",
  model: (env) => (env.DEEPGRAM_MODEL ?? "").trim() || "nova-3",
  route: () => "direct",
  requiredKeys: () => ["DEEPGRAM_API_KEY"],
  listUsdPerMin: () => LIST_USD_PER_MIN,
  async transcribe({ audio, mime, detectedSec, env, fetchImpl = fetch }) {
    const model = deepgram.model(env);
    const params = new URLSearchParams({ model, language: "multi", diarize: "true", smart_format: "true", punctuate: "true", utterances: "true" });
    try {
      const res = await fetchImpl(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, "Content-Type": mime },
        body: audio,
      });
      if (!res.ok) return { ok: false, httpStatus: res.status, error: await readError(res, "Deepgram"), cost: null };
      const body = (await res.json()) as DeepgramResponse;
      const provided = finite(body.metadata?.duration);
      const durationSec = provided ?? detectedSec;
      const segments = segmentsFromDeepgram(body);
      return {
        ok: true,
        httpStatus: res.status,
        segments,
        speakers: countSpeakers(segments),
        durationSec,
        languageTags: "word",
        model: `${model}/multi`,
        requestId: body.metadata?.request_id ?? null,
        // Deepgram's response carries no charge; its usage API is account-level. List price × billed duration.
        cost: { usd: (durationSec / 60) * LIST_USD_PER_MIN, source: provided ? "list_price_x_provider_duration" : "list_price_x_detected_duration" },
      };
    } catch (e) {
      return { ok: false, httpStatus: null, error: errText(e), cost: null };
    }
  },
};
