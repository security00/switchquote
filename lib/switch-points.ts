import { heuristicTag } from "./langtag";
import { dominant, isLowConfidence, normalizeWordText, type Lang, type Segment, type Word } from "./transcript";

export type WindowToken = {
  si: number;
  wi: number;
  w: string;
  lang: Lang;
  confidence?: number;
  role: "context" | "boundary";
};

export type SwitchWindow = {
  id: string;
  reason: "code_switch" | "low_confidence_boundary";
  anchor: { si: number; wi: number };
  tokens: WindowToken[];
};

type Flat = { si: number; wi: number; word: Word };

function flatten(segments: Segment[]): Flat[] {
  const out: Flat[] = [];
  segments.forEach((s, si) => s.words.forEach((word, wi) => out.push({ si, wi, word })));
  return out;
}

/**
 * Windows around each code-switch and around every low-confidence word.
 * Overlapping anchors for the same word collapse to one window; a real switch wins over a low-confidence flag.
 */
export function switchWindows(segments: Segment[], radius = 2): SwitchWindow[] {
  const flat = flatten(segments);
  const switchAt = new Set<number>();
  let prev: Lang | null = null;
  flat.forEach((token, i) => {
    if (token.word.lang === "other") return;
    if (prev && token.word.lang !== prev) switchAt.add(i);
    prev = token.word.lang;
  });

  const anchors: { i: number; reason: SwitchWindow["reason"] }[] = [];
  for (const i of switchAt) anchors.push({ i, reason: "code_switch" });
  flat.forEach((token, i) => {
    if (switchAt.has(i)) return;
    if (!isLowConfidence(token.word.confidence)) return;
    anchors.push({ i, reason: "low_confidence_boundary" });
  });

  const map = new Map<string, SwitchWindow>();
  for (const anchor of anchors) {
    const from = Math.max(0, anchor.i - radius);
    const to = Math.min(flat.length - 1, anchor.i + radius);
    const tokens: WindowToken[] = [];
    for (let i = from; i <= to; i += 1) {
      const token = flat[i];
      tokens.push({
        si: token.si,
        wi: token.wi,
        w: token.word.w,
        lang: token.word.lang,
        ...(token.word.confidence !== undefined ? { confidence: token.word.confidence } : {}),
        role: i === anchor.i || switchAt.has(i) || switchAt.has(i + 1) ? "boundary" : "context",
      });
    }
    const at = flat[anchor.i];
    const window: SwitchWindow = {
      id: `${at.si}:${at.wi}`,
      reason: anchor.reason,
      anchor: { si: at.si, wi: at.wi },
      tokens,
    };
    const existing = map.get(window.id);
    if (!existing || (existing.reason !== "code_switch" && window.reason === "code_switch")) map.set(window.id, window);
  }
  return [...map.values()];
}

function tokenKey(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function wordNear(segments: Segment[], si: number, wi: number, step: -1 | 1): Word | null {
  let s = si;
  let w = wi + step;
  while (segments[s]) {
    if (w >= 0 && w < segments[s].words.length) return segments[s].words[w];
    s += step;
    if (!segments[s]) return null;
    w = step < 0 ? segments[s].words.length - 1 : 0;
  }
  return null;
}

/** A one-token suggestion that does not repeat this word or either neighbor. Multi-word text is refused so a model cannot insert a leftover duplicate. */
export function usableSuggestion(segments: Segment[], si: number, wi: number, raw: string): string | null {
  const text = normalizeWordText(raw);
  if (!text || /\s/.test(text)) return null;
  const key = tokenKey(text);
  const word = segments[si]?.words[wi];
  if (!word || !key) return null;
  if (tokenKey(word.w) === key) return null;
  const prev = wordNear(segments, si, wi, -1);
  const next = wordNear(segments, si, wi, 1);
  if (prev && tokenKey(prev.w) === key) return null;
  if (next && tokenKey(next.w) === key) return null;
  return text;
}

export function hasMixedSpokenLangs(segments: Segment[]): boolean {
  let en = false;
  let es = false;
  for (const seg of segments) {
    for (const word of seg.words) {
      if (word.lang === "en") en = true;
      if (word.lang === "es") es = true;
    }
  }
  return en && es;
}

/**
 * Language used for switch marks. Deepgram's per-word language is ignored: nova-3 multi
 * labeled a real code-switched clip as entirely Spanish. Lexical tags (lib/langtag.ts) are
 * used instead, unless another engine already returned both languages.
 */
export function languagesForSwitches(segments: Segment[], engineId: string): { segments: Segment[]; method: "lexical" | "engine" } {
  if (engineId !== "deepgram" && hasMixedSpokenLangs(segments)) return { segments, method: "engine" };
  return { segments: heuristicTag(segments), method: "lexical" };
}

export function flagLowConfidence(segments: Segment[]): Segment[] {
  return segments.map((seg) => ({
    ...seg,
    words: seg.words.map((word) => (isLowConfidence(word.confidence) ? { ...word, needsReview: true } : word)),
  }));
}

export function languagesLookUntagged(segments: Segment[]): boolean {
  return segments.length > 0 && segments.every((s) => s.words.every((w) => w.lang === "other"));
}

function overlap(a: Word, b: Word): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export type CrossCheckResult = { segments: Segment[]; checked: number; disagreements: number };

/**
 * Compare switch and low-confidence words with a second transcript by timestamp overlap.
 * Disagreement flags Review suggested and may store a one-token suggestion. It does not change the word.
 */
export function crossCheckSwitchWindows(primary: Segment[], secondary: Segment[]): CrossCheckResult {
  const windows = switchWindows(primary);
  const boundary = new Set<string>();
  for (const window of windows) {
    for (const token of window.tokens) if (token.role === "boundary") boundary.add(`${token.si}:${token.wi}`);
  }
  primary.forEach((seg, si) => seg.words.forEach((word, wi) => {
    if (word.needsReview || isLowConfidence(word.confidence)) boundary.add(`${si}:${wi}`);
  }));
  if (!boundary.size) return { segments: primary, checked: 0, disagreements: 0 };
  const secondaryFlat = flatten(secondary);
  const updates = new Map<string, Word>();
  let checked = 0;
  let disagreements = 0;

  for (const key of boundary) {
    const [si, wi] = key.split(":").map(Number);
    const word = primary[si]?.words[wi];
    if (!word) continue;
    let best: Word | null = null;
    let bestOverlap = 0;
    for (const token of secondaryFlat) {
      const span = overlap(word, token.word);
      if (span > bestOverlap) {
        bestOverlap = span;
        best = token.word;
      }
    }
    if (!best || bestOverlap <= 0) continue;
    checked += 1;
    const textDiffers = tokenKey(best.w) !== tokenKey(word.w);
    const langDiffers = (best.lang === "en" || best.lang === "es") && best.lang !== word.lang;
    if (!textDiffers && !langDiffers) continue;
    disagreements += 1;
    const suggestion: NonNullable<Word["suggestion"]> = { ...word.suggestion };
    const text = textDiffers ? usableSuggestion(primary, si, wi, best.w) : null;
    if (text) suggestion.text = text;
    if (langDiffers) suggestion.lang = best.lang;
    const next: Word = { ...word, needsReview: true };
    if (suggestion.text || suggestion.lang) next.suggestion = suggestion;
    updates.set(key, next);
  }

  if (!updates.size) return { segments: primary, checked, disagreements };
  const segments = primary.map((seg, si) => {
    let changed = false;
    let langChanged = false;
    const words = seg.words.map((word, wi) => {
      const next = updates.get(`${si}:${wi}`);
      if (!next) return word;
      changed = true;
      if (next.lang !== word.lang) langChanged = true;
      return next;
    });
    if (!changed) return seg;
    return { ...seg, words, lang: langChanged ? dominant(words) : seg.lang };
  });
  return { segments, checked, disagreements };
}

export type LangFix = { si: number; wi: number; lang?: Lang; text?: string };

export function parseVerifyFixes(raw: unknown, segments: Segment[]): LangFix[] {
  if (!raw || typeof raw !== "object") return [];
  const fixes = (raw as { fixes?: unknown }).fixes;
  if (!Array.isArray(fixes)) return [];
  const out: LangFix[] = [];
  for (const item of fixes) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { si?: unknown; wi?: unknown; lang?: unknown; text?: unknown };
    const si = typeof rec.si === "number" && Number.isInteger(rec.si) ? rec.si : -1;
    const wi = typeof rec.wi === "number" && Number.isInteger(rec.wi) ? rec.wi : -1;
    const word = segments[si]?.words[wi];
    if (!word) continue;
    const lang = rec.lang === "en" || rec.lang === "es" || rec.lang === "other" ? rec.lang : undefined;
    const text = typeof rec.text === "string" ? usableSuggestion(segments, si, wi, rec.text) ?? undefined : undefined;
    const usefulLang = lang && lang !== word.lang ? lang : undefined;
    if (!usefulLang && !text) continue;
    out.push({ si, wi, ...(usefulLang ? { lang: usefulLang } : {}), ...(text ? { text } : {}) });
  }
  return out;
}

/** Store model ideas as suggestions. Words and language labels stay as they are until a person accepts one. */
export function applyVerifyFixes(segments: Segment[], fixes: LangFix[]): { segments: Segment[]; disagreements: number } {
  if (!fixes.length) return { segments, disagreements: 0 };
  const map = new Map(fixes.map((fix) => [`${fix.si}:${fix.wi}`, fix]));
  let disagreements = 0;
  const next = segments.map((seg, si) => {
    let changed = false;
    const words = seg.words.map((word, wi) => {
      const fix = map.get(`${si}:${wi}`);
      if (!fix) return word;
      disagreements += 1;
      changed = true;
      const suggestion: NonNullable<Word["suggestion"]> = { ...word.suggestion };
      if (fix.text) suggestion.text = fix.text;
      if (fix.lang) suggestion.lang = fix.lang;
      return { ...word, needsReview: true, suggestion };
    });
    if (!changed) return seg;
    return { ...seg, words };
  });
  return { segments: next, disagreements };
}
