import type { Lang, Segment } from "./transcript";
import { dominant } from "./transcript";
import type { EngineCost } from "./engines/types";

/**
 * Fallback switch detector for engines that return no per-word language (AssemblyAI, Grok, ElevenLabs).
 * - "heuristic": free, deterministic. Spanish/English function-word lexicons + orthography (ñ, accents,
 *   ¿¡, -ción, -ing, th…); ambiguous words inherit the language of their neighbours.
 * - "llm": one cheap OpenRouter text call per ~2,500 words returns language runs per line over
 *   indexed tokens ([[0,"s"],[4,"e"]]); any line whose runs don't fit falls back to the heuristic. Cost = OpenRouter usage.cost,
 *   recorded as its own spend event (kind "tag").
 * Neither changes a single transcript word; only `lang` is filled in.
 */
export type TaggerMode = "llm" | "heuristic" | "off";
export type TagResult = { segments: Segment[]; method: "llm" | "heuristic" | "llm+heuristic" | "off"; model: string | null; cost: EngineCost | null; httpStatus: number | null; error?: string };

const ES = new Set(
  ("que de la el los las un una unos unas y o pero porque pues entonces como cuando donde dónde qué cómo cuándo quién quien muy más mas también tambien " +
    "es está esta estoy estaba estaban están son soy era eran fue ser estar tengo tiene tienen tenía hay había hace hacer hizo dice dijo digo voy va vamos van " +
    "yo tú tu él ella nosotros ellos ellas usted ustedes mi mis su sus nuestro nuestra eso esto ese esa este estos esas aquí ahí allí allá ya sí si nada todo todos " +
    "toda todas mucho mucha muchos poco algo alguien nunca siempre bueno buena bien mal sea del al con sin por para sobre entre hasta desde hacia según durante " +
    "le les lo nos se te mí ti conmigo contigo así ahora después antes luego hoy ayer mañana año años casa gente cosa cosas vez veces día días mismo misma otro otra " +
    "cuál cual cuanto cuánto mamá papá hijo hija hermano hermana trabajo escuela dinero claro verdad oye mira sabes entiendes digamos osea o sea ni tampoco aunque " +
    "estaba están estamos fui fuimos puedo puede pueden quiero quiere sé creo pienso hablar hablo habla español inglés").split(/\s+/)
);
const EN = new Set(
  ("the and of to in is it that was for on are with as at be this have from or by an they we you he she his her their our your my me him them us " +
    "not but what all were when there can said which do does did done if will would could should up out about who get got go going went just like so " +
    "know think because really very yeah yes okay ok well than then now also into been being had has how its it's i'm don't didn't can't that's there's " +
    "these those some any more most other only over such our here where why after before through between while again always never something anything " +
    "people school work money mom dad brother sister friend friends english spanish thing things time year years day stuff kind lot right gonna wanna").split(/\s+/)
);
/** Words that are common in both languages, or too short to judge. */
const AMBIGUOUS = new Set("a no me he ha son come pan sale red fin mar real hasta solo once sin ten tan sea dice".split(/\s+/));

const clean = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}'’]+$/gu, "").replace(/’/g, "'");

/** Per-word guess, or null when the word alone can't decide. */
export function guessWord(raw: string): Lang | null {
  const w = clean(raw);
  if (!w || !/\p{L}/u.test(w)) return "other";
  if (AMBIGUOUS.has(w)) return null;
  if (/[¿¡]/.test(raw) || /[ñáéíóúü]/.test(w)) return "es";
  if (ES.has(w)) return "es";
  if (EN.has(w)) return "en";
  if (/'(s|t|re|ll|ve|d|m)$/.test(w)) return "en";
  if (/(ción|ciones|mente|idad|ando|iendo|ado|ada|ados|adas|ito|ita|itos|itas|amos|emos|imos)$/.test(w) && w.length > 4) return "es";
  if (/(ing|tion|ness|ship|ful|ly|ed|ight|ough|ould)$/.test(w) && w.length > 3) return "en";
  if (/^(th|wh|sh)|w|k|ck|oo/.test(w)) return "en";
  if (/rr/.test(w) || /[ao]s?$/.test(w)) return "es";
  return null;
}

/** Heuristic tags over the whole transcript; undecided words inherit from the previous (else next) decided word. */
export function heuristicTag(segments: Segment[]): Segment[] {
  const flat = segments.flatMap((s) => s.words);
  const guesses = flat.map((w) => guessWord(w.w));
  let prev: Lang | null = null;
  const filled = guesses.map((g) => {
    if (g === "en" || g === "es") prev = g;
    return g ?? prev;
  });
  let next: Lang | null = null;
  for (let i = filled.length - 1; i >= 0; i -= 1) {
    if (filled[i] === "en" || filled[i] === "es") next = filled[i];
    else if (filled[i] === null) filled[i] = next;
  }
  let k = 0;
  return segments.map((s) => {
    const words = s.words.map((w) => ({ ...w, lang: (filled[k++] ?? "other") as Lang }));
    return { ...s, words, lang: dominant(words) };
  });
}

const CODE: Record<string, Lang> = { e: "en", en: "en", s: "es", es: "es", o: "other", other: "other" };
const SYSTEM =
  "You label the spoken language of every token in Spanish–English code-switched interview transcript lines. " +
  'Each input line is a list of tokens written as "index:token". For each line return the language runs as ' +
  '[[startIndex, "e"|"s"|"o"], ...] in order, where a run lasts until the next run starts: "e" = English, "s" = Spanish, ' +
  '"o" = names, numbers, fillers or unclear. The first run must start at 0. Loanwords take the language of the sentence around them. ' +
  'Return JSON only: {"lines": [ [[0,"s"],[4,"e"]], ... ]} with exactly one entry per input line, same order.';

/** Runs [[start, code], ...] → one Lang per token, or null if the runs don't describe this line. */
export function expandRuns(runs: unknown, n: number): Lang[] | null {
  if (!Array.isArray(runs) || !runs.length) return null;
  const parsed = runs.map((r) => (Array.isArray(r) ? { i: Number(r[0]), lang: CODE[String(r[1] ?? "").toLowerCase()] } : null));
  if (parsed.some((r) => !r || !Number.isInteger(r.i) || !r.lang || r.i < 0 || r.i >= n)) return null;
  const list = parsed as { i: number; lang: Lang }[];
  if (list[0].i !== 0 || list.some((r, k) => k > 0 && r.i <= list[k - 1].i)) return null;
  const out: Lang[] = new Array(n);
  list.forEach((r, k) => out.fill(r.lang, r.i, k + 1 < list.length ? list[k + 1].i : n));
  return out;
}

async function llmChunk(lines: string[][], apiKey: string, model: string, referer: string, fetchImpl: typeof fetch) {
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": referer, "X-Title": "SwitchQuote" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ lines: lines.map((l) => l.map((w, i) => `${i}:${w}`).join(" ")) }) },
      ],
      response_format: { type: "json_object" },
      reasoning: { effort: "minimal" },
      usage: { include: true },
      temperature: 0,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } };
  const cost = typeof body.usage?.cost === "number" ? body.usage.cost : null;
  if (!res.ok) return { ok: false as const, status: res.status, cost, error: body.error?.message || `OpenRouter ${res.status}` };
  try {
    const parsed = JSON.parse((body.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "")) as { lines?: unknown };
    const tags = Array.isArray(parsed.lines) ? parsed.lines.map((runs, k) => expandRuns(runs, lines[k]?.length ?? 0)) : [];
    return { ok: true as const, status: res.status, cost, tags };
  } catch {
    return { ok: false as const, status: res.status, cost, error: "tagger returned invalid JSON" };
  }
}

export async function tagLanguages(
  segments: Segment[],
  opts: { mode: TaggerMode; apiKey?: string; model: string; referer: string; fetchImpl?: typeof fetch; chunkWords?: number }
): Promise<TagResult> {
  if (opts.mode === "off") return { segments, method: "off", model: null, cost: null, httpStatus: null };
  const heuristic = heuristicTag(segments);
  if (opts.mode === "heuristic" || !opts.apiKey) return { segments: heuristic, method: "heuristic", model: null, cost: null, httpStatus: null };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const chunkWords = opts.chunkWords ?? 2500;
  const out = heuristic.map((s) => ({ ...s, words: s.words.map((w) => ({ ...w })) }));
  let usd = 0;
  let anyCost = false;
  let fellBack = 0;
  let status: number | null = null;
  let error: string | undefined;
  for (let i = 0; i < segments.length; ) {
    const idx: number[] = [];
    let n = 0;
    while (i < segments.length && (n === 0 || n + segments[i].words.length <= chunkWords)) {
      idx.push(i);
      n += segments[i].words.length;
      i += 1;
    }
    let r: Awaited<ReturnType<typeof llmChunk>>;
    try {
      r = await llmChunk(idx.map((j) => segments[j].words.map((w) => w.w)), opts.apiKey, opts.model, opts.referer, fetchImpl);
    } catch (e) {
      r = { ok: false, status: 0, cost: null, error: e instanceof Error ? e.message : String(e) };
    }
    status = r.status || status;
    if (r.cost !== null) {
      usd += r.cost;
      anyCost = true;
    }
    if (!r.ok) {
      error = r.error;
      fellBack += idx.length;
      continue;
    }
    idx.forEach((j, k) => {
      const tags = r.ok ? r.tags[k] : null;
      if (!tags || tags.length !== segments[j].words.length) {
        fellBack += 1;
        return;
      }
      out[j].words.forEach((w, wi) => (w.lang = tags[wi]));
      out[j].lang = dominant(out[j].words);
    });
  }
  return {
    segments: out,
    method: fellBack === 0 ? "llm" : fellBack >= segments.length ? "heuristic" : "llm+heuristic",
    model: opts.model,
    cost: anyCost ? { usd, source: "provider_returned" } : null,
    httpStatus: status,
    ...(error ? { error } : {}),
  };
}

/** Rough upper estimate for admission: ~150 words/min, ~5 input tokens (indexed) + ~1 output token per word, ×2 margin. */
export const tagEstimateUsd = (seconds: number) => Math.max(0.0005, (seconds / 60) * 150 * (5 * 0.3e-6 + 1 * 2.5e-6) * 2);
