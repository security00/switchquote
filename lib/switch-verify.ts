import type { EngineCost } from "./engines/types";
import { heuristicTag } from "./langtag";
import {
  applyVerifyFixes,
  crossCheckSwitchWindows,
  languagesLookUntagged,
  parseVerifyFixes,
  switchWindows,
  type SwitchWindow,
} from "./switch-points";
import type { Segment } from "./transcript";

export type VerifyMethod = "cross-check" | "llm" | "skipped";

export type VerifyChoice = {
  mode: "cross" | "llm" | "skip";
  secondaryId: "deepgram" | "assemblyai" | null;
  llm: "openrouter" | "google" | null;
};

type KeyEnv = {
  DEEPGRAM_API_KEY?: string;
  ASSEMBLYAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GOOGLE_API_KEY?: string;
};

/** Cross-check when both speech keys exist. Otherwise an LLM pass. Otherwise leave the draft alone. */
export function chooseVerifyMode(env: KeyEnv, primaryEngineId: string): VerifyChoice {
  const dg = Boolean(env.DEEPGRAM_API_KEY?.trim());
  const aai = Boolean(env.ASSEMBLYAI_API_KEY?.trim());
  const llm = env.OPENROUTER_API_KEY?.trim() ? ("openrouter" as const) : env.GOOGLE_API_KEY?.trim() ? ("google" as const) : null;
  let secondaryId: VerifyChoice["secondaryId"] = null;
  if (dg && aai) secondaryId = primaryEngineId === "deepgram" ? "assemblyai" : "deepgram";
  if (secondaryId) return { mode: "cross", secondaryId, llm };
  if (llm) return { mode: "llm", secondaryId: null, llm };
  return { mode: "skip", secondaryId: null, llm: null };
}

export type VerifyResult = {
  segments: Segment[];
  method: VerifyMethod;
  checked: number;
  disagreements: number;
  model: string | null;
  httpStatus: number | null;
  cost: EngineCost | null;
  error?: string;
};

const skipped = (segments: Segment[], error?: string): VerifyResult => ({
  segments,
  method: "skipped",
  checked: 0,
  disagreements: 0,
  model: null,
  httpStatus: null,
  cost: null,
  ...(error ? { error } : {}),
});

const SYSTEM =
  "You check language labels on Spanish–English code-switched interview text. " +
  "Each window lists tokens as si:wi:lang:word. Return JSON only: " +
  '{"fixes":[{"si":0,"wi":2,"lang":"en"}]}. ' +
  'lang is "en", "es", or "other". Include a token only when its label is wrong. ' +
  "You may add a single replacement token as text, but never a second word, and never a copy of the previous or next token. " +
  "Do not translate. Omit text when the spoken word should stay.";

const SCHEMA = {
  name: "switch_fixes",
  strict: true,
  schema: {
    type: "object",
    properties: {
      fixes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            si: { type: "integer" },
            wi: { type: "integer" },
            lang: { type: "string", enum: ["en", "es", "other"] },
            text: { type: "string" },
          },
          required: ["si", "wi", "lang"],
          additionalProperties: false,
        },
      },
    },
    required: ["fixes"],
    additionalProperties: false,
  },
};

function windowPayload(windows: SwitchWindow[]): string {
  return JSON.stringify({
    windows: windows.map((window) => ({
      id: window.id,
      reason: window.reason,
      tokens: window.tokens.map((token) => `${token.si}:${token.wi}:${token.lang}:${token.w}`).join(" "),
    })),
  });
}

export type LlmVerifyOpts = {
  provider: "openrouter" | "google";
  apiKey: string;
  model: string;
  referer: string;
  fetchImpl?: typeof fetch;
};

type LlmCall = { ok: boolean; httpStatus: number | null; cost: EngineCost | null; fixes: ReturnType<typeof parseVerifyFixes>; error?: string };

async function callVerifier(segments: Segment[], windows: SwitchWindow[], opts: LlmVerifyOpts): Promise<LlmCall> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const payload = windowPayload(windows);
  try {
    if (opts.provider === "google") {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${SYSTEM}\n\n${payload}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        error?: { message?: string };
      };
      if (!res.ok) return { ok: false, httpStatus: res.status, cost: null, fixes: [], error: body.error?.message || `Google ${res.status}` };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
      const prompt = body.usageMetadata?.promptTokenCount ?? 0;
      const out = body.usageMetadata?.candidatesTokenCount ?? 0;
      const usd = (prompt * 0.75 + out * 3.75) / 1e6;
      return { ok: true, httpStatus: res.status, cost: prompt || out ? { usd, source: "list_price_x_tokens" } : null, fixes: parseVerifyFixes(parsed, segments) };
    }
    const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": opts.referer, "X-Title": "SwitchQuote" },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: payload },
        ],
        response_format: { type: "json_schema", json_schema: SCHEMA },
        temperature: 0,
        usage: { include: true },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { cost?: number };
      error?: { message?: string };
    };
    const cost = typeof body.usage?.cost === "number" ? { usd: body.usage.cost, source: "provider_returned" as const } : null;
    if (!res.ok) return { ok: false, httpStatus: res.status, cost, fixes: [], error: body.error?.message || `OpenRouter ${res.status}` };
    const parsed = JSON.parse((body.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
    return { ok: true, httpStatus: res.status, cost, fixes: parseVerifyFixes(parsed, segments) };
  } catch (e) {
    return { ok: false, httpStatus: null, cost: null, fixes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export type LlmSpend = {
  estimateUsd: number;
  run: () => Promise<LlmCall>;
};

/**
 * Prefer a second transcript (Deepgram ↔ AssemblyAI). If that pass is absent or fails, ask the configured LLM.
 * No keys and no secondary transcript → the original segments, method "skipped".
 */
export async function verifySwitchTranscript(
  segments: Segment[],
  opts: {
    crossCheck?: () => Promise<Segment[] | null>;
    llm?: LlmVerifyOpts | null;
    /** When set, the LLM call is handed to the caller so spend can be recorded around it. */
    spendLlm?: (job: LlmSpend) => Promise<LlmCall>;
  }
): Promise<VerifyResult> {
  const windows = switchWindows(segments);
  if (!windows.length) return skipped(segments);

  if (opts.crossCheck) {
    try {
      const secondary = await opts.crossCheck();
      if (secondary && secondary.length) {
        const tagged = languagesLookUntagged(secondary) ? heuristicTag(secondary) : secondary;
        const checked = crossCheckSwitchWindows(segments, tagged);
        return {
          segments: checked.segments,
          method: "cross-check",
          checked: checked.checked,
          disagreements: checked.disagreements,
          model: null,
          httpStatus: null,
          cost: null,
        };
      }
    } catch (e) {
      if (!opts.llm) return skipped(segments, e instanceof Error ? e.message : String(e));
    }
  }

  if (!opts.llm?.apiKey) return skipped(segments, opts.crossCheck ? "Secondary transcript unavailable." : undefined);
  const job: LlmSpend = { estimateUsd: 0.01, run: () => callVerifier(segments, windows, opts.llm as LlmVerifyOpts) };
  const called = opts.spendLlm ? await opts.spendLlm(job).catch((e: unknown) => ({ ok: false as const, httpStatus: null, cost: null, fixes: [], error: e instanceof Error ? e.message : String(e) })) : await job.run();
  if (!called.ok) return { ...skipped(segments, called.error), httpStatus: called.httpStatus, cost: called.cost, model: opts.llm.model };
  const applied = applyVerifyFixes(segments, called.fixes);
  return {
    segments: applied.segments,
    method: "llm",
    checked: windows.reduce((n, window) => n + window.tokens.filter((token) => token.role === "boundary").length, 0),
    disagreements: applied.disagreements,
    model: opts.llm.model,
    httpStatus: called.httpStatus,
    cost: called.cost,
  };
}
