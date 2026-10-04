import type { EngineAdapter } from "./types";
import { countSpeakers, errText, finite, groupWords, readError, speakerIndexer } from "./util";

/**
 * AssemblyAI Universal-3.5 Pro: $0.21/hr + speaker diarization $0.02/hr.
 * https://www.assemblyai.com/pricing, fetched 2026-10-05.
 */
const LIST_USD_PER_MIN = (0.21 + 0.02) / 60;
const API = "https://api.assemblyai.com/v2";

type AaiWord = { text?: string; start?: number; end?: number; speaker?: string | null };
type AaiTranscript = { id?: string; status?: string; error?: string; audio_duration?: number; words?: AaiWord[] };

export const assemblyai: EngineAdapter = {
  id: "assemblyai",
  label: "AssemblyAI Universal-3.5 Pro",
  caps: {
    diarization: true,
    wordTimestamps: true,
    languageTags: "none",
    note: "Code-switching mode (en+es) keeps both languages, but only a file-level language is returned; fallback tagger adds per-word lang.",
  },
  priceSource: "https://www.assemblyai.com/pricing",
  model: (env) => (env.ASSEMBLYAI_MODEL ?? "").trim() || "universal-3-5-pro",
  route: () => "direct",
  requiredKeys: () => ["ASSEMBLYAI_API_KEY"],
  listUsdPerMin: () => LIST_USD_PER_MIN,
  maxBytes: 200 * 1024 * 1024,
  async transcribe({ audio, detectedSec, env, fetchImpl = fetch }) {
    const model = assemblyai.model(env);
    const headers = { Authorization: String(env.ASSEMBLYAI_API_KEY) };
    const pollMs = Number(env.ASSEMBLYAI_POLL_MS || 3000);
    try {
      const up = await fetchImpl(`${API}/upload`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: audio });
      if (!up.ok) return { ok: false, httpStatus: up.status, error: await readError(up, "AssemblyAI upload"), cost: null };
      const { upload_url } = (await up.json()) as { upload_url?: string };
      const create = await fetchImpl(`${API}/transcript`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: upload_url,
          speech_models: [model],
          language_detection: true,
          language_detection_options: { code_switching: true, expected_languages: ["en", "es"] },
          speaker_labels: true,
          punctuate: true,
          format_text: true,
        }),
      });
      if (!create.ok) return { ok: false, httpStatus: create.status, error: await readError(create, "AssemblyAI transcript"), cost: null };
      let t = (await create.json()) as AaiTranscript;
      const deadline = Date.now() + 12 * 60 * 1000;
      while (t.status !== "completed" && t.status !== "error" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));
        const poll = await fetchImpl(`${API}/transcript/${t.id}`, { headers });
        if (!poll.ok) return { ok: false, httpStatus: poll.status, error: await readError(poll, "AssemblyAI poll"), cost: null };
        t = (await poll.json()) as AaiTranscript;
      }
      // Privacy: delete the provider-side transcript (and its uploaded audio) once we have it.
      if (t.id) await fetchImpl(`${API}/transcript/${t.id}`, { method: "DELETE", headers }).catch(() => undefined);
      if (t.status !== "completed") {
        return { ok: false, httpStatus: 200, error: `AssemblyAI ${t.status || "timeout"}: ${String(t.error || "").slice(0, 200)}`, cost: null };
      }
      const speaker = speakerIndexer();
      const segments = groupWords(
        (t.words || []).map((w) => ({ w: String(w.text || ""), start: Number(w.start || 0) / 1000, end: Number(w.end || 0) / 1000, speaker: speaker(w.speaker ?? "A") }))
      );
      const provided = finite(t.audio_duration);
      const durationSec = provided ?? detectedSec;
      return {
        ok: true,
        httpStatus: 200,
        segments,
        speakers: countSpeakers(segments),
        durationSec,
        languageTags: "none",
        model,
        requestId: t.id ?? null,
        cost: { usd: (durationSec / 60) * LIST_USD_PER_MIN, source: provided ? "list_price_x_provider_duration" : "list_price_x_detected_duration" },
      };
    } catch (e) {
      return { ok: false, httpStatus: null, error: errText(e), cost: null };
    }
  },
};
