import type { EngineAdapter } from "./types";
import { countSpeakers, errText, finite, groupWords, readError, speakerIndexer } from "./util";

/**
 * ElevenLabs Scribe (speech-to-text). POST https://api.elevenlabs.io/v1/speech-to-text, multipart.
 * Scribe v2 list price $0.22/hr (https://elevenlabs.io/pricing/api, fetched 2026-10-05); diarization included.
 * Returns word timestamps + speaker_id and one file-level language_code → fallback tagger for per-word lang.
 */
const LIST_USD_PER_MIN = 0.22 / 60;

type ElWord = { text?: string; type?: string; start?: number; end?: number; speaker_id?: string };
type ElResponse = { language_code?: string; words?: ElWord[]; audio_duration_secs?: number; transcription_id?: string };

export const elevenlabs: EngineAdapter = {
  id: "elevenlabs",
  label: "ElevenLabs Scribe",
  caps: { diarization: true, wordTimestamps: true, languageTags: "none", note: "Diarization + word timestamps; one file-level language. Fallback tagger adds per-word lang." },
  priceSource: "https://elevenlabs.io/pricing/api",
  model: (env) => (env.ELEVENLABS_MODEL ?? "").trim() || "scribe_v2",
  route: () => "direct",
  requiredKeys: () => ["ELEVENLABS_API_KEY"],
  listUsdPerMin: () => LIST_USD_PER_MIN,
  async transcribe({ audio, mime, format, detectedSec, env, fetchImpl = fetch }) {
    const model = elevenlabs.model(env);
    const form = new FormData();
    form.append("model_id", model);
    form.append("diarize", "true");
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    form.append("file", new Blob([audio], { type: mime }), `audio.${format}`);
    try {
      const res = await fetchImpl("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": String(env.ELEVENLABS_API_KEY) }, body: form });
      if (!res.ok) return { ok: false, httpStatus: res.status, error: await readError(res, "ElevenLabs"), cost: null };
      const body = (await res.json()) as ElResponse;
      const speaker = speakerIndexer();
      const segments = groupWords(
        (body.words || [])
          .filter((w) => (w.type ?? "word") === "word")
          .map((w) => ({ w: String(w.text || ""), start: Number(w.start || 0), end: Number(w.end || 0), speaker: speaker(w.speaker_id ?? "speaker_0") }))
      );
      const provided = finite(body.audio_duration_secs);
      const durationSec = provided ?? detectedSec;
      return {
        ok: true, httpStatus: res.status, segments, speakers: countSpeakers(segments), durationSec, languageTags: "none", model, requestId: body.transcription_id ?? null,
        cost: { usd: (durationSec / 60) * LIST_USD_PER_MIN, source: provided ? "list_price_x_provider_duration" : "list_price_x_detected_duration" },
      };
    } catch (e) {
      return { ok: false, httpStatus: null, error: errText(e), cost: null };
    }
  },
};
