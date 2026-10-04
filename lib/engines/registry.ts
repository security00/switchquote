import type { AppEnv } from "../cf";
import { parseAllowlist } from "../config";
import { assemblyai } from "./assemblyai";
import { deepgram } from "./deepgram";
import { elevenlabs } from "./elevenlabs";
import { gemini } from "./gemini";
import { grok } from "./grok";
import type { EngineAdapter } from "./types";

/**
 * Engine registry. To add a model: write lib/engines/<id>.ts exporting an EngineAdapter, then add it here.
 * Selection: STT_ENGINE (default "deepgram"); allowlisted ADMIN_EMAILS may override per request with the
 * `x-sq-engine` header for testing. Users never choose an engine.
 */
export const ENGINES: readonly EngineAdapter[] = [deepgram, assemblyai, gemini, grok, elevenlabs];

export const DEFAULT_ENGINE = "deepgram";

export function getEngine(id: string): EngineAdapter | undefined {
  return ENGINES.find((e) => e.id === id);
}

const disabledByConfig = (env: Partial<AppEnv>) => new Set((env.ENGINES_DISABLED ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

export type EngineStatus = {
  id: string;
  label: string;
  model: string;
  route: string;
  enabled: boolean;
  /** Env var NAMES that are missing (never values). */
  missingKeys: string[];
  disabledByConfig: boolean;
  isDefault: boolean;
  caps: EngineAdapter["caps"];
  listUsdPerMin: number;
  priceSource: string;
};

export function engineStatus(env: Partial<AppEnv>, e: EngineAdapter): EngineStatus {
  const missingKeys = e.requiredKeys(env).filter((k) => !String((env as Record<string, unknown>)[k] ?? "").trim());
  const off = disabledByConfig(env).has(e.id);
  return {
    id: e.id,
    label: e.label,
    model: e.model(env),
    route: e.route(env),
    enabled: missingKeys.length === 0 && !off,
    missingKeys,
    disabledByConfig: off,
    isDefault: e.id === defaultEngineId(env),
    caps: e.caps,
    listUsdPerMin: e.listUsdPerMin(env),
    priceSource: e.priceSource,
  };
}

export const listEngines = (env: Partial<AppEnv>) => ENGINES.map((e) => engineStatus(env, e));

export function defaultEngineId(env: Partial<AppEnv>): string {
  const id = (env.STT_ENGINE ?? env.STT_PROVIDER ?? "").trim().toLowerCase();
  return id && getEngine(id) ? id : DEFAULT_ENGINE;
}

export function isAdmin(env: Partial<AppEnv>, email: string | null | undefined): boolean {
  const admins = parseAllowlist(env.ADMIN_EMAILS);
  // Empty ADMIN_EMAILS means nobody (never "everyone", unlike the transcription allowlist).
  return Boolean(admins && email && admins.includes(email.trim().toLowerCase()));
}

export type EngineChoice = { ok: true; engine: EngineAdapter; overridden: boolean } | { ok: false; status: number; code: string; error: string };

/** Pick the engine for one request: config default, or an admin's explicit override. */
export function chooseEngine(env: Partial<AppEnv>, email: string | null, override: string | null | undefined): EngineChoice {
  const requested = (override ?? "").trim().toLowerCase();
  let id = defaultEngineId(env);
  let overridden = false;
  if (requested && requested !== id) {
    if (!isAdmin(env, email)) return { ok: false, status: 403, code: "engine_override_forbidden", error: "Engine override is for admins only." };
    id = requested;
    overridden = true;
  }
  const engine = getEngine(id);
  if (!engine) return { ok: false, status: 400, code: "unknown_engine", error: `Unknown engine "${id}".` };
  const st = engineStatus(env, engine);
  if (!st.enabled) {
    return { ok: false, status: 503, code: "engine_disabled", error: overridden ? `Engine "${id}" is disabled (${st.disabledByConfig ? "by config" : `missing ${st.missingKeys.join(", ")}`}).` : "Transcription isn't configured yet." };
  }
  return { ok: true, engine, overridden };
}
