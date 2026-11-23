/** Transcript model shared by the server (Deepgram parsing) and the browser (viewer + exports). */

export type Lang = "en" | "es" | "other";
/** Words under this score get a confidence mark. Engines report 0–1. */
export const LOW_CONFIDENCE = 0.7;
export const NOTE_MAX = 500;
export const TRANSLATION_MAX = 4000;
export type Word = {
  w: string;
  lang: Lang;
  start: number;
  end: number;
  /** 0–1 when the engine reported a score. */
  confidence?: number;
  /** A person marked this word checked. */
  reviewed?: boolean;
  /** Secondary verification wants a human look. */
  needsReview?: boolean;
  /** Optional replacement the reader can accept. Never applied on its own. */
  suggestion?: { text?: string; lang?: Lang };
};
export type SegmentLang = Lang | "mixed";
export type Segment = {
  speaker: number;
  start: number;
  end: number;
  lang: SegmentLang;
  words: Word[];
  /** Review / fact-check note for this turn. Included in exports. */
  note?: string;
};
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

export function clampConfidence(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.min(1, Math.max(0, raw));
}

export function isLowConfidence(confidence: number | undefined): boolean {
  return typeof confidence === "number" && confidence < LOW_CONFIDENCE;
}

type DgWord = { word?: string; punctuated_word?: string; start?: number; end?: number; speaker?: number; language?: string; confidence?: number };
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
    .map((w) => {
      const word: Word = {
        w: String(w.punctuated_word ?? w.word ?? "").trim(),
        lang: normLang(w.language),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
      };
      const confidence = clampConfidence(w.confidence);
      if (confidence !== undefined) word.confidence = confidence;
      return word;
    })
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

/** Empty string clears the note. Null means it is not usable. */
export function normalizeNote(raw: string): string | null {
  const note = raw.replace(/\s+/g, " ").trim();
  if (!note) return "";
  if (note.length > NOTE_MAX || /[\u0000-\u001f\u007f]/.test(note)) return null;
  return note;
}

/** Empty string clears the English line. Null means it is not usable. */
export function normalizeTranslation(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length > TRANSLATION_MAX || /[\u0000-\u001f\u007f]/.test(text)) return null;
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
  const record = body as {
    op?: unknown;
    speaker?: unknown;
    name?: unknown;
    si?: unknown;
    wi?: unknown;
    w?: unknown;
    lang?: unknown;
    text?: unknown;
    note?: unknown;
    reviewed?: unknown;
    find?: unknown;
    replacement?: unknown;
    all?: unknown;
    index?: unknown;
  };
  if (record.op === "anonymize") {
    const seen: number[] = [];
    for (const seg of source.segments) if (!seen.includes(seg.speaker)) seen.push(seg.speaker);
    if (!seen.length) return { ok: false, error: INVALID_EDIT };
    const speakers: SpeakerNames = {};
    seen.forEach((speaker, i) => {
      speakers[String(speaker)] = `P${String(i + 1).padStart(2, "0")}`;
    });
    return { ok: true, transcript: { ...source, speakers } };
  }
  if (record.op === "replace") return replaceWords(source, record);
  if (record.op === "translation") {
    const si = intOf(record.si, Math.max(0, source.segments.length - 1));
    if (si === null || !source.segments.length || typeof record.text !== "string") return { ok: false, error: INVALID_EDIT };
    const text = normalizeTranslation(record.text);
    if (text === null) return { ok: false, error: `Use an English line of ${TRANSLATION_MAX} characters or fewer.` };
    const translation = source.translation ? [...source.translation] : source.segments.map(() => "");
    while (translation.length < source.segments.length) translation.push("");
    translation.length = source.segments.length;
    translation[si] = text;
    return { ok: true, transcript: { ...source, translation } };
  }
  if (record.op === "note") {
    const si = intOf(record.si, Math.max(0, source.segments.length - 1));
    if (si === null || !source.segments[si] || typeof record.note !== "string") return { ok: false, error: INVALID_EDIT };
    const note = normalizeNote(record.note);
    if (note === null) return { ok: false, error: `Use a note of ${NOTE_MAX} characters or fewer.` };
    const segments = source.segments.map((s, i) => {
      if (i !== si) return s;
      const next = { ...s };
      if (note) next.note = note;
      else delete next.note;
      return next;
    });
    return { ok: true, transcript: { ...source, segments } };
  }
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
  if (record.op === "accept_suggestion") {
    const current = seg.words[wi];
    const suggestion = current.suggestion;
    if (!suggestion?.text && !suggestion?.lang) return { ok: false, error: INVALID_EDIT };
    const text = suggestion.text ?? current.w;
    const lang = suggestion.lang ?? current.lang;
    if (!isLang(lang) || !normalizeWordText(text)) return { ok: false, error: INVALID_EDIT };
    const words = seg.words.map((word, i) => (i === wi ? withoutSuggestion({ ...word, w: text, lang, reviewed: true, needsReview: false }) : word));
    const segments = source.segments.map((s, i) => (i === si ? { ...s, words, lang: dominant(words) } : s));
    return { ok: true, transcript: { ...source, segments, translation: text === current.w ? source.translation : blankTranslationLine(source.translation, si) } };
  }
  if (record.op === "review_word") {
    const reviewed = record.reviewed === true;
    const words = seg.words.map((word, i) => (i === wi ? { ...word, reviewed, ...(reviewed ? { needsReview: false } : {}) } : word));
    const segments = source.segments.map((s, i) => (i === si ? { ...s, words } : s));
    return { ok: true, transcript: { ...source, segments } };
  }
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
  const words = seg.words.map((word, i) => (i === wi ? withoutSuggestion({ ...word, w: text, lang }) : word));
  const segments = source.segments.map((s, i) => (i === si ? { ...s, words, lang: dominant(words) } : s));
  return { ok: true, transcript: { ...source, segments, translation: blankTranslationLine(source.translation, si) } };
}

function withoutSuggestion(word: Word): Word {
  const next = { ...word };
  delete next.suggestion;
  return next;
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

function replaceWords<T extends Transcript>(
  source: T,
  record: { find?: unknown; replacement?: unknown; all?: unknown; index?: unknown }
): { ok: true; transcript: T } | { ok: false; error: string } {
  if (typeof record.find !== "string" || typeof record.replacement !== "string") return { ok: false, error: INVALID_EDIT };
  const find = record.find;
  if (!find.trim() || find.length > WORD_TEXT_MAX) return { ok: false, error: INVALID_EDIT };
  const all = record.all === true;
  const index = typeof record.index === "number" && Number.isInteger(record.index) && record.index >= 0 ? record.index : 0;
  let seen = 0;
  const touched = new Set<number>();
  const segments = source.segments.map((seg, si) => {
    let changed = false;
    const words = seg.words.map((word) => {
      const at = word.w.toLowerCase().indexOf(find.toLowerCase());
      if (at < 0) return word;
      const hit = seen;
      seen += 1;
      if (!all && hit !== index) return word;
      const nextRaw = word.w.slice(0, at) + record.replacement + word.w.slice(at + find.length);
      const text = normalizeWordText(nextRaw);
      if (!text) return word;
      changed = true;
      touched.add(si);
      return { ...word, w: text };
    });
    if (!changed) return seg;
    return { ...seg, words, lang: dominant(words) };
  });
  if (!touched.size) return { ok: true, transcript: source };
  let translation = source.translation;
  for (const si of touched) translation = blankTranslationLine(translation, si);
  return { ok: true, transcript: { ...source, segments, translation } };
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

function langMarks(s: Segment, si: number, switches: Set<string>): string {
  return s.words.map((w, wi) => `${w.lang}${switches.has(`${si}:${wi}`) ? "*" : ""}`).join(" ");
}

export function toTxt(t: Transcript): string {
  const switches = switchPoints(t.segments);
  const lines = [`${t.filename} — SwitchQuote transcript (AI draft — verify quotes before publishing)`, ""];
  t.segments.forEach((s, i) => {
    lines.push(`[${clock(s.start)}] ${speakerLabel(s.speaker, t.speakers)} (${s.lang}): ${segmentText(s)}`);
    lines.push(`    langs: ${langMarks(s, i, switches)}`);
    if (s.note) lines.push(`    note: ${s.note}`);
    if (t.translation?.[i]) lines.push(`    EN: ${t.translation[i]}`);
  });
  return lines.join("\n") + "\n";
}

export function toSrt(t: Transcript): string {
  const switches = switchPoints(t.segments);
  return (
    t.segments
      .map((s, i) => {
        const cue = [
          `${i + 1}`,
          `${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}`,
          `${speakerLabel(s.speaker, t.speakers)}: ${segmentText(s)}`,
          `langs: ${langMarks(s, i, switches)}`,
        ];
        if (s.note) cue.push(`note: ${s.note}`);
        return `${cue.join("\n")}\n`;
      })
      .join("\n") + "\n"
  );
}

function vttTime(sec: number): string {
  return srtTime(sec).replace(",", ".");
}

export function toVtt(t: Transcript): string {
  const switches = switchPoints(t.segments);
  const cues = t.segments.map((s, i) => {
    const lines = [
      `${vttTime(s.start)} --> ${vttTime(Math.max(s.end, s.start + 0.5))}`,
      `${speakerLabel(s.speaker, t.speakers)}: ${segmentText(s)}`,
      `langs: ${langMarks(s, i, switches)}`,
    ];
    if (s.note) lines.push(`note: ${s.note}`);
    return lines.join("\n");
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Word-level CSV: timestamps, speaker, language, confidence, switch_point. */
export function toCsv(t: Transcript): string {
  const switches = switchPoints(t.segments);
  const rows = [["start", "end", "speaker", "word", "language", "confidence", "switch_point"]];
  t.segments.forEach((s, si) => {
    s.words.forEach((w, wi) => {
      rows.push([
        w.start.toFixed(2),
        w.end.toFixed(2),
        speakerLabel(s.speaker, t.speakers),
        w.w,
        w.lang,
        w.confidence === undefined ? "" : w.confidence.toFixed(3),
        switches.has(`${si}:${wi}`) ? "true" : "false",
      ]);
    });
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function plainCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ");
}

/** Tab-separated NVivo transcript rows: speaker, timestamp, language tag, text. */
export function toNvivo(t: Transcript): string {
  const rows = [["speaker", "timestamp", "language", "text"]];
  t.segments.forEach((s, i) => {
    const text = s.note ? `${segmentText(s)} [note: ${s.note}]` : segmentText(s);
    const english = t.translation?.[i];
    rows.push([speakerLabel(s.speaker, t.speakers), clock(s.start), s.lang, english ? `${text} [EN: ${english}]` : text]);
  });
  return rows.map((row) => row.map(plainCell).join("\t")).join("\n") + "\n";
}

/** JSON export per PRD: speaker / start / end / text / lang (+ words with per-word lang, + text_en when translated). */
export function toJson(t: Transcript): string {
  const switches = switchPoints(t.segments);
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
        ...(s.note ? { note: s.note } : {}),
        ...(t.translation?.[i] ? { text_en: t.translation[i] } : {}),
        words: s.words.map((w, wi) => ({
          w: w.w,
          lang: w.lang,
          start: Number(w.start.toFixed(2)),
          end: Number(w.end.toFixed(2)),
          ...(w.confidence !== undefined ? { confidence: Number(w.confidence.toFixed(3)) } : {}),
          ...(switches.has(`${i}:${wi}`) ? { switch_point: true } : {}),
          ...(w.reviewed ? { reviewed: true } : {}),
        })),
      })),
    },
    null,
    2
  );
}
