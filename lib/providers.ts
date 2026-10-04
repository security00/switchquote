import type { DeepgramResponse, Segment } from "./transcript";
import { segmentText } from "./transcript";

export type SttResult =
  | { ok: true; httpStatus: number; durationSec: number | null; requestId: string | null; body: DeepgramResponse }
  | { ok: false; httpStatus: number | null; error: string };

/** Deepgram pre-recorded: Nova-3 multilingual with per-word language, diarization and utterances. */
export async function transcribeDeepgram(apiKey: string, model: string, audio: ArrayBuffer, contentType: string): Promise<SttResult> {
  const params = new URLSearchParams({
    model,
    language: "multi",
    diarize: "true",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
  });
  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": contentType },
      body: audio,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, httpStatus: res.status, error: `Deepgram ${res.status}: ${text}` };
    }
    const body = (await res.json()) as DeepgramResponse;
    const d = Number(body.metadata?.duration);
    return { ok: true, httpStatus: res.status, durationSec: Number.isFinite(d) && d > 0 ? d : null, requestId: body.metadata?.request_id ?? null, body };
  } catch (e) {
    return { ok: false, httpStatus: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export const MAX_TRANSLATE_WORDS = 20_000;
export const translateEstimateUsd = (words: number) => Math.max(0.001, words * 1e-5);

export type TranslateResult =
  | { ok: true; httpStatus: number; lines: string[]; costUsd: number | null }
  | { ok: false; httpStatus: number | null; error: string; costUsd: number | null };

/**
 * Opt-in English reference translation (OpenRouter). One output line per transcript segment.
 * The original transcript is never modified.
 */
export async function translateSegments(apiKey: string, model: string, segments: Segment[], referer: string): Promise<TranslateResult> {
  const lines = segments.map(segmentText);
  const system =
    "You translate Spanish–English code-switched interview transcript lines into natural English for reference. " +
    "Keep English parts as they are, translate Spanish parts faithfully, keep names, do not summarize, do not add or drop lines. " +
    'Return JSON: {"lines": [ ...exactly one English string per input line, same order... ]}.';
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": referer, "X-Title": "SwitchQuote" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ lines }) },
        ],
        response_format: { type: "json_object" },
        reasoning: { effort: "low" },
        usage: { include: true },
        temperature: 0,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { cost?: number };
      error?: { message?: string };
    };
    const costUsd = typeof body.usage?.cost === "number" ? body.usage.cost : null;
    if (!res.ok) return { ok: false, httpStatus: res.status, error: body.error?.message || `OpenRouter ${res.status}`, costUsd };
    const content = body.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return { ok: false, httpStatus: res.status, error: "Translation came back in an unexpected shape.", costUsd };
    const out = lines.map((_, i) => String((parsed.lines as unknown[])[i] ?? ""));
    return { ok: true, httpStatus: res.status, lines: out, costUsd };
  } catch (e) {
    return { ok: false, httpStatus: null, error: e instanceof Error ? e.message : String(e), costUsd: null };
  }
}
