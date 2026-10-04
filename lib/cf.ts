export type AppEnv = {
  DB: D1Database;
  EMAIL?: SendEmail;
  /** "preview" on preview versions (set by the preview workflow); empty in production. */
  DEPLOY_CHANNEL?: string;
  /** Comma-separated Google emails allowed to run paid inference. Empty or "*" = every signed-in account. */
  TRANSCRIBE_ALLOWLIST?: string;
  /** One-time minutes for a new allowed account (lifetime, never resets). */
  SIGNUP_FREE_MINUTES?: string;
  MAX_FILE_MB?: string;
  MAX_DURATION_MIN?: string;
  /** Upper estimate for one Translate to English call (actual OpenRouter cost is recorded after). */
  TRANSLATE_ESTIMATE_USD?: string;
  USER_DAILY_SPEND_LIMIT_USD?: string;
  DAILY_SPEND_LIMIT_USD?: string;
  /** Optional prefix for spend ledgers so a preview version never trips the live breaker. */
  SPEND_NAMESPACE?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Default transcription engine id (lib/engines/registry.ts). STT_PROVIDER is the legacy name. */
  STT_ENGINE?: string;
  STT_PROVIDER?: string;
  /** Comma-separated Google emails allowed to override the engine per request (x-sq-engine header). */
  ADMIN_EMAILS?: string;
  /** Comma-separated engine ids switched off regardless of keys. */
  ENGINES_DISABLED?: string;
  /** Fallback switch detector for engines without per-word language: llm | heuristic | off. */
  LANG_TAGGER?: string;
  LANG_TAGGER_MODEL?: string;
  ASSEMBLYAI_MODEL?: string;
  ASSEMBLYAI_POLL_MS?: string;
  GEMINI_ROUTE?: string;
  GEMINI_MODEL?: string;
  GROK_ROUTE?: string;
  GROK_MODEL?: string;
  ELEVENLABS_MODEL?: string;
  ASSEMBLYAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  XAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  DEEPGRAM_MODEL?: string;
  TRANSLATE_MODEL?: string;
  DEEPGRAM_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  AUTH_SECRET?: string;
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
};

export async function getEnv(): Promise<AppEnv | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const typed = env as unknown as AppEnv;
    if (typed?.DB) return typed;
  } catch {
    // next build without bindings
  }
  return null;
}

export async function requireEnv(): Promise<AppEnv> {
  const env = await getEnv();
  if (!env) throw new Error("Cloudflare bindings are not available");
  return env;
}

export async function runInBackground(promise: Promise<unknown>): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
      return;
    }
  } catch {
    // fall through
  }
  await promise;
}

export function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const utcDay = (ts = nowSeconds()) => new Date(ts * 1000).toISOString().slice(0, 10);
