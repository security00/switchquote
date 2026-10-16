/** Transcript model shared by the server (Deepgram parsing) and the browser (viewer + exports). */

export type Lang = "en" | "es" | "other";
export type Word = { w: string; lang: Lang; start: number; end: number };
export type SegmentLang = Lang | "mixed";
export type Segment = { speaker: number; start: number; end: number; lang: SegmentLang; words: Word[] };
/** Custom display names keyed by speaker index ("0", "1", …). */
export type SpeakerNames = Record<string, string>;
export type Transcript = {
  id: string;
  filename: string;
  durationSec: number;
  engine: string;
  /** Where per-word language came from: "word" (engine), "span-prompted" (LLM transcriber), "fallback:llm|heuristic|…". */
  langTags?: string | null;
  createdAt: number;
  segments: Segment[];
  speakers?: SpeakerNames | null;
  /** English reference lines, one per segment, only after the user asks for it. */
  translation: string[] | null;
};

export const SPEAKER_NAME_MAX = 80;
export const WORD_TEXT_MAX = 120;

export function normLang(raw: unknown): Lang {
  const v = typeof raw === "string" ? raw.toLowerCase() : "";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";
  return "other";
}

type DgWord = { word?: string; punctuated_word?: string; start?: number; end?: number; speaker?: number; language?: string };
type DgUtterance = { start?: number; end?: number; speaker?: number; words?: DgWord[] };
export type DeepgramResponse = {
  metadata?: { duration?: number; request_id?: string };
  results?: {
    utterances?: DgUtterance[];
    channels?: { alternatives?: { words?: DgWord[] }[] }[];
  };
};

/** Segment language: en / es, or "mixed" when the minority language is at least 20% of en+es words. */
export function dominant(words: Word[]): SegmentLang {
  const counts: Record<Lang, number> = { en: 0, es: 0, other: 0 };
  for (const w of words) counts[w.lang] += 1;
  const total = counts.en + counts.es;
  if (!total) return "other";
  if (Math.min(counts.en, counts.es) / total >= 0.2) return "mixed";
  return counts.es > counts.en ? "es" : "en";
}

function toWords(list: DgWord[] | undefined): Word[] {
  return (list || [])
    .map((w) => ({
      w: String(w.punctuated_word ?? w.word ?? "").trim(),
      lang: normLang(w.language),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
    }))
    .filter((w) => w.w);
}

/** Deepgram `/v1/listen` (utterances=true, diarize=true, language=multi) → segments. */
export function segmentsFromDeepgram(res: DeepgramResponse): Segment[] {
  const utterances = res.results?.utterances;
  if (utterances && utterances.length) {
    return utterances
      .map((u) => {
        const words = toWords(u.words);
        return { speaker: Number(u.speaker ?? 0), start: Number(u.start ?? 0), end: Number(u.end ?? 0), lang: dominant(words), words };
      })
      .filter((s) => s.words.length);
  }
  // Fallback: group channel words by speaker turns.
  const raw = res.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  const segments: Segment[] = [];
  for (const w of raw) {
    const [word] = toWords([w]);
    if (!word) continue;
    const speaker = Number(w.speaker ?? 0);
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker && word.start - last.end < 1.5) {
      last.words.push(word);
      last.end = word.end;
    } else {
      segments.push({ speaker, start: word.start, end: word.end, lang: "other", words: [word] });
    }
  }
  for (const s of segments) s.lang = dominant(s.words);
  return segments;
}

/**
 * Switch points: a word whose language (en/es) differs from the previous en/es word,
 * across segment boundaries. Returns "segmentIndex:wordIndex" keys.
 */
export function switchPoints(segments: Segment[]): Set<string> {
  const keys = new Set<string>();
  let prev: Lang | null = null;
  segments.forEach((s, si) =>
    s.words.forEach((w, wi) => {
      if (w.lang === "other") return;
      if (prev && w.lang !== prev) keys.add(`${si}:${wi}`);
      prev = w.lang;
    })
  );
  return keys;
}

export const segmentText = (s: Segment) => s.words.map((w) => w.w).join(" ");

function pad(n: number, len = 2) {
  return String(Math.floor(n)).padStart(len, "0");
}
export function clock(sec: number): string {
  return `${pad(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)}`;
}
function srtTime(sec: number): string {
  const ms = Math.round((sec % 1) * 1000);
  return `${clock(sec)},${pad(ms, 3)}`;
}
export const speakerLabel = (n: number, names?: SpeakerNames | null) => names?.[String(n)]?.trim() || `Speaker ${n + 1}`;

export function durationLabel(sec: number): string {
  return sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.round(sec)} s`;
}

/** Empty string clears a custom name. Null means the text is not a usable name. */
export function normalizeSpeakerName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (name.length > SPEAKER_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export function normalizeWordText(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > WORD_TEXT_MAX || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

export function parseSpeakerNames(raw: string | null | undefined): SpeakerNames | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const speakers: SpeakerNames = {};
  for (const [key, name] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || typeof name !== "string") continue;
    const clean = normalizeSpeakerName(name);
    if (clean) speakers[String(Number(key))] = clean;
  }
  return Object.keys(speakers).length ? speakers : null;
}

export function translationIsComplete(segments: Segment[], translation: string[] | null | undefined): boolean {
  return Boolean(translation && translation.length === segments.length && translation.every((line) => line.trim().length > 0));
}

export type WordRef = { si: number; wi: number };

/** Pull-quote text for a contiguous word range, using renamed speakers and corrected words. */
export function formatQuote(t: Transcript, from: WordRef, to: WordRef): string | null {
  if (!wordAt(t, from) || !wordAt(t, to)) return null;
  const [start, end] = compareRefs(from, to) <= 0 ? [from, to] : [to, from];
  const chunks: { speaker: number; start: number; words: string[] }[] = [];
  for (let si = start.si; si <= end.si; si++) {
    const seg = t.segments[si];
    const wi0 = si === start.si ? start.wi : 0;
    const wi1 = si === end.si ? end.wi : seg.words.length - 1;
    const slice = seg.words.slice(wi0, wi1 + 1);
    if (!slice.length) continue;
    const prev = chunks[chunks.length - 1];
    if (prev && prev.speaker === seg.speaker) prev.words.push(...slice.map((w) => w.w));
    else chunks.push({ speaker: seg.speaker, start: slice[0].start, words: slice.map((w) => w.w) });
  }
  if (!chunks.length) return null;
  const quoted = (words: string[]) => `“${words.join(" ")}”`;
  if (chunks.length === 1) {
    const chunk = chunks[0];
    return `${quoted(chunk.words)}\n— ${speakerLabel(chunk.speaker, t.speakers)}, ${clock(chunk.start)}`;
  }
  return chunks.map((chunk) => `${speakerLabel(chunk.speaker, t.speakers)} (${clock(chunk.start)}): ${quoted(chunk.words)}`).join("\n");
}

export function formatSegmentQuote(t: Transcript, si: number): string | null {
  const seg = t.segments[si];
  if (!seg?.words.length) return null;
  return formatQuote(t, { si, wi: 0 }, { si, wi: seg.words.length - 1 });
}

const INVALID_EDIT = "That edit isn't valid.";

export function applyTranscriptEdit<T extends Transcript>(source: T, body: unknown): { ok: true; transcript: T } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: INVALID_EDIT };
  const record = body as { op?: unknown; speaker?: unknown; name?: unknown; si?: unknown; wi?: unknown; w?: unknown; lang?: unknown };
  if (record.op === "speaker") {
    const speaker = intOf(record.speaker, 9999);
    if (speaker === null || typeof record.name !== "string") return { ok: false, error: INVALID_EDIT };
    const name = normalizeSpeakerName(record.name);
    if (name === null) return { ok: false, error: `Use a speaker name of ${SPEAKER_NAME_MAX} characters or fewer.` };
    if (!source.segments.some((s) => s.speaker === speaker)) return { ok: false, error: INVALID_EDIT };
    const speakers: SpeakerNames = { ...(source.speakers ?? {}) };
    if (name) speakers[String(speaker)] = name;
    else delete speakers[String(speaker)];
    return { ok: true, transcript: { ...source, speakers: Object.keys(speakers).length ? speakers : null } };
  }
  const si = intOf(record.si, Math.max(0, source.segments.length - 1));
  const seg = si === null ? undefined : source.segments[si];
  const wi = seg && seg.words.length ? intOf(record.wi, seg.words.length - 1) : null;
  if (si === null || wi === null || !seg?.words[wi]) return { ok: false, error: INVALID_EDIT };
  if (record.op === "delete_word") {
    if (seg.words.length === 1) {
      return {
        ok: true,
        transcript: {
          ...source,
          segments: source.segments.filter((_, i) => i !== si),
          translation: dropTranslationLine(source.translation, si),
        },
      };
    }
    const words = seg.words.filter((_, i) => i !== wi);
    const segments = source.segments.map((s, i) => (i === si ? { ...s, words, lang: dominant(words), start: words[0].start, end: words[words.length - 1].end } : s));
    return { ok: true, transcript: { ...source, segments, translation: blankTranslationLine(source.translation, si) } };
  }
  const lang = record.lang;
  if (record.op !== "word" || typeof record.w !== "string" || !isLang(lang)) return { ok: false, error: INVALID_EDIT };
  const text = normalizeWordText(record.w);
  if (!text) return { ok: false, error: record.w.trim() ? `Use a word of ${WORD_TEXT_MAX} characters or fewer.` : "Type the corrected word." };
  const current = seg.words[wi];
  if (current.w === text && current.lang === lang) return { ok: true, transcript: source };
  const words = seg.words.map((word, i) => (i === wi ? { ...word, w: text, lang } : word));
  const segments = source.segments.map((s, i) => (i === si ? { ...s, words, lang: dominant(words) } : s));
  return { ok: true, transcript: { ...source, segments, translation: blankTranslationLine(source.translation, si) } };
}

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "es" || value === "other";
}

function intOf(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function wordAt(t: Transcript, ref: WordRef): Word | null {
  return t.segments[ref.si]?.words[ref.wi] ?? null;
}

function compareRefs(a: WordRef, b: WordRef): number {
  return a.si - b.si || a.wi - b.wi;
}

function blankTranslationLine(translation: string[] | null, si: number): string[] | null {
  if (!translation || si < 0 || si >= translation.length) return translation;
  return translation.map((line, i) => (i === si ? "" : line));
}

function dropTranslationLine(translation: string[] | null, si: number): string[] | null {
  if (!translation) return null;
  const next = translation.filter((_, i) => i !== si);
  return next.length ? next : null;
}

export function toTxt(t: Transcript): string {
  const lines = [`${t.filename} — SwitchQuote transcript (AI draft — verify quotes before publishing)`, ""];
  t.segments.forEach((s, i) => {
    lines.push(`[${clock(s.start)}] ${speakerLabel(s.speaker, t.speakers)} (${s.lang}): ${segmentText(s)}`);
    if (t.translation?.[i]) lines.push(`    EN: ${t.translation[i]}`);
  });
  return lines.join("\n") + "\n";
}

export function toSrt(t: Transcript): string {
  return (
    t.segments
      .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}\n${speakerLabel(s.speaker, t.speakers)}: ${segmentText(s)}\n`)
      .join("\n") + "\n"
  );
}

/** JSON export per PRD: speaker / start / end / text / lang (+ words with per-word lang, + text_en when translated). */
export function toJson(t: Transcript): string {
  return JSON.stringify(
    {
      file: t.filename,
      duration_sec: t.durationSec,
      engine: t.engine,
      ...(t.langTags ? { lang_tags: t.langTags } : {}),
      ...(t.speakers && Object.keys(t.speakers).length ? { speakers: t.speakers } : {}),
      segments: t.segments.map((s, i) => ({
        speaker: speakerLabel(s.speaker, t.speakers),
        start: Number(s.start.toFixed(2)),
        end: Number(s.end.toFixed(2)),
        text: segmentText(s),
        lang: s.lang,
        ...(t.translation?.[i] ? { text_en: t.translation[i] } : {}),
        words: s.words.map((w) => ({ w: w.w, lang: w.lang, start: Number(w.start.toFixed(2)), end: Number(w.end.toFixed(2)) })),
      })),
    },
    null,
    2
  );
}
