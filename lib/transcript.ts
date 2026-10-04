/** Transcript model shared by the server (Deepgram parsing) and the browser (viewer + exports). */

export type Lang = "en" | "es" | "other";
export type Word = { w: string; lang: Lang; start: number; end: number };
export type SegmentLang = Lang | "mixed";
export type Segment = { speaker: number; start: number; end: number; lang: SegmentLang; words: Word[] };
export type Transcript = {
  id: string;
  filename: string;
  durationSec: number;
  engine: string;
  /** Where per-word language came from: "word" (engine), "span-prompted" (LLM transcriber), "fallback:llm|heuristic|…". */
  langTags?: string | null;
  createdAt: number;
  segments: Segment[];
  /** English reference lines, one per segment, only after the user asks for it. */
  translation: string[] | null;
};

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
export const speakerLabel = (n: number) => `Speaker ${n + 1}`;

export function toTxt(t: Transcript): string {
  const lines = [`${t.filename} — SwitchQuote transcript (AI draft — verify quotes before publishing)`, ""];
  t.segments.forEach((s, i) => {
    lines.push(`[${clock(s.start)}] ${speakerLabel(s.speaker)} (${s.lang}): ${segmentText(s)}`);
    if (t.translation?.[i]) lines.push(`    EN: ${t.translation[i]}`);
  });
  return lines.join("\n") + "\n";
}

export function toSrt(t: Transcript): string {
  return (
    t.segments
      .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}\n${speakerLabel(s.speaker)}: ${segmentText(s)}\n`)
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
      segments: t.segments.map((s, i) => ({
        speaker: speakerLabel(s.speaker),
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
