import type { AppEnv } from "../cf";
import type { DurationResult } from "../duration";
import type { Segment } from "../transcript";

/**
 * One transcription engine behind one interface. Every adapter turns its provider's answer into
 * the same normalized shape (segments → words with per-word lang when the engine gives it,
 * speakers, duration) plus the cost of that one call.
 */

/** Where an engine's per-word language comes from. */
export type LangTagSupport =
  /** Engine returns a language per word (Deepgram Nova-3 multi). */
  | "word"
  /** We ask an LLM-transcriber to return language-tagged spans (Gemini); model-generated, not acoustic. */
  | "span-prompted"
  /** No per-word language: the fallback switch detector (lib/langtag.ts) fills it in. */
  | "none";

export type EngineCaps = {
  diarization: boolean;
  /** true = provider word timestamps; false = estimated by us from segment/sentence timing. */
  wordTimestamps: boolean;
  languageTags: LangTagSupport;
  /** One-line human note for README / health / cost table. */
  note: string;
};

/**
 * How the USD figure was obtained:
 * - provider_returned: the provider's response states the charge (OpenRouter usage.cost).
 * - list_price_x_provider_duration: published $/min × the duration the provider reports.
 * - list_price_x_detected_duration: published $/min × our own header-parsed duration.
 * - list_price_x_tokens: published $/token × the token counts the provider reports.
 * - estimate: the call failed before a cost could be known; the admission estimate stands.
 */
export type CostSource =
  | "provider_returned"
  | "list_price_x_provider_duration"
  | "list_price_x_detected_duration"
  | "list_price_x_tokens"
  | "estimate";

export type EngineCost = { usd: number; source: CostSource };

export type EngineInput = {
  audio: ArrayBuffer;
  mime: string;
  format: DurationResult["format"];
  /** Duration parsed from the file header (used when the provider reports none). */
  detectedSec: number;
  env: AppEnv;
  /** Public site origin, sent as HTTP-Referer to OpenRouter. */
  referer: string;
  /** Test seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export type EngineOutput = {
  segments: Segment[];
  speakers: number;
  durationSec: number;
  /** "word"/"span-prompted" when the engine tagged languages itself; "none" means words are lang "other" until tagged. */
  languageTags: LangTagSupport;
  model: string;
  requestId: string | null;
  httpStatus: number;
  cost: EngineCost;
};

export type EngineResult = ({ ok: true } & EngineOutput) | { ok: false; httpStatus: number | null; error: string; cost: EngineCost | null };

export interface EngineAdapter {
  /** Stable id used in config (STT_ENGINE), spend_events.engine and transcripts.engine. */
  readonly id: string;
  readonly label: string;
  readonly caps: EngineCaps;
  /** Model id for the current config. */
  model(env: Partial<AppEnv>): string;
  /** Route actually used, e.g. "direct", "openrouter", "google". */
  route(env: Partial<AppEnv>): string;
  /** Env var names that must be non-empty for this engine (names only, never values). */
  requiredKeys(env: Partial<AppEnv>): string[];
  /** Published list price in USD per audio minute for the current route (admission estimate and fallback cost). */
  listUsdPerMin(env: Partial<AppEnv>): number;
  /** Where that list price was published (for docs / cost table). */
  readonly priceSource: string;
  /** Largest upload this route can take (base64-in-JSON routes are capped lower to fit Worker memory). */
  maxBytes?: number;
  transcribe(input: EngineInput): Promise<EngineResult>;
}
