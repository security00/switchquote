import { Buffer } from "node:buffer";
import type { Lang, Segment, Word } from "../transcript";
import { dominant } from "../transcript";

export type RawWord = { w: string; start: number; end: number; speaker: number; lang?: Lang };

/** Group words into segments on speaker change or a pause of at least `gapSec`. */
export function groupWords(words: RawWord[], gapSec = 1.5): Segment[] {
  const segments: Segment[] = [];
  for (const rw of words) {
    const text = rw.w.trim();
    if (!text) continue;
    const word: Word = { w: text, lang: rw.lang ?? "other", start: rw.start, end: rw.end };
    const last = segments[segments.length - 1];
    if (last && last.speaker === rw.speaker && word.start - last.end < gapSec) {
      last.words.push(word);
      last.end = Math.max(last.end, word.end);
    } else {
      segments.push({ speaker: rw.speaker, start: word.start, end: word.end, lang: "other", words: [word] });
    }
  }
  for (const s of segments) s.lang = dominant(s.words);
  return segments;
}

/** Spread whitespace-separated tokens of `text` evenly (by characters) over [start, end]. */
export function wordsWithEstimatedTimes(text: string, start: number, end: number, lang: Lang = "other"): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((n, t) => n + t.length + 1, 0) || 1;
  const span = Math.max(0, end - start);
  let cursor = start;
  return tokens.map((t) => {
    const dur = (span * (t.length + 1)) / totalChars;
    const w = { w: t, lang, start: cursor, end: cursor + dur };
    cursor += dur;
    return w;
  });
}

/** Text-only transcript → sentence segments with timestamps estimated proportionally to length. */
export function segmentsFromPlainText(text: string, durationSec: number): Segment[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const total = sentences.reduce((n, s) => n + s.length, 0) || 1;
  let cursor = 0;
  return sentences.map((s) => {
    const dur = (durationSec * s.length) / total;
    const words = wordsWithEstimatedTimes(s, cursor, cursor + dur);
    const seg: Segment = { speaker: 0, start: cursor, end: cursor + dur, lang: "other", words };
    cursor += dur;
    return seg;
  });
}

export const countSpeakers = (segments: Segment[]) => new Set(segments.map((s) => s.speaker)).size;

/** Speaker labels like "A", "speaker_1", 2 → stable 0-based indexes in order of first appearance. */
export function speakerIndexer() {
  const map = new Map<string, number>();
  return (raw: unknown): number => {
    const key = String(raw ?? "0");
    if (!map.has(key)) map.set(key, map.size);
    return map.get(key)!;
  };
}

export function toBase64(buf: ArrayBuffer): string {
  // nodejs_compat provides Buffer in the Worker; Node has it natively.
  return Buffer.from(buf).toString("base64");
}

/** Audio format names accepted by OpenRouter `input_audio.format`. */
export const OPENROUTER_AUDIO_FORMAT: Record<string, string> = { wav: "wav", mp3: "mp3", mp4: "m4a", ogg: "ogg", flac: "flac" };

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function readError(res: Response, label: string): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  return `${label} ${res.status}: ${text}`;
}

export const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
