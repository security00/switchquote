import type { AppEnv } from "./cf";

function num(raw: string | undefined, fallback: number): number {
  const v = Number((raw ?? "").trim());
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function parseAllowlist(raw: string | undefined): string[] | null {
  const value = (raw ?? "").trim();
  if (!value || value === "*") return null;
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function parseTagger(raw: string | undefined): "llm" | "heuristic" | "off" {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "heuristic" || v === "off" ? v : "llm";
}

export type RuntimeConfig = ReturnType<typeof readConfig>;

export function readConfig(env: Partial<AppEnv>) {
  return {
    allowlist: parseAllowlist(env.TRANSCRIBE_ALLOWLIST),
    signupFreeMinutes: num(env.SIGNUP_FREE_MINUTES, 0),
    maxFileBytes: Math.round(num(env.MAX_FILE_MB, 50) * 1024 * 1024),
    maxDurationSec: Math.round(num(env.MAX_DURATION_MIN, 60) * 60),
    translateEstimateUsd: num(env.TRANSLATE_ESTIMATE_USD, 0.1),
    userDailyLimitUsd: num(env.USER_DAILY_SPEND_LIMIT_USD, 1),
    dailyLimitUsd: num(env.DAILY_SPEND_LIMIT_USD, 3),
    spendNamespace: (env.SPEND_NAMESPACE ?? "").trim() ? `${env.SPEND_NAMESPACE!.trim()}:` : "",
    alertTo: (env.ALERT_EMAIL_TO ?? "").trim(),
    alertFrom: (env.ALERT_EMAIL_FROM ?? "").trim(),
    turnstileSiteKey: (env.TURNSTILE_SITE_KEY ?? "").trim(),
    turnstileSecret: (env.TURNSTILE_SECRET_KEY ?? "").trim(),
    langTagger: parseTagger(env.LANG_TAGGER),
    langTaggerModel: (env.LANG_TAGGER_MODEL ?? "").trim() || "google/gemini-3.5-flash-lite",
    translateModel: (env.TRANSLATE_MODEL ?? "google/gemini-3.8-flash").trim() || "google/gemini-3.8-flash",
    isPreview: (env.DEPLOY_CHANNEL ?? "").trim() === "preview",
    googleConfigured: Boolean((env.AUTH_GOOGLE_ID ?? "").trim() && (env.AUTH_GOOGLE_SECRET ?? "").trim()),
  };
}
