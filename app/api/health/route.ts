import { getEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { defaultEngineId, listEngines } from "@/lib/engines/registry";

export const dynamic = "force-dynamic";

/** Public health check: which pieces are configured — never secret values or spend. */
export async function GET() {
  const env = await getEnv();
  if (!env) return Response.json({ ok: false, error: "bindings unavailable" }, { status: 503 });
  let db = false;
  try {
    db = Boolean(await env.DB.prepare("SELECT 1 AS ok").first());
  } catch {
    db = false;
  }
  const c = readConfig(env);
  return Response.json(
    {
      ok: db,
      // Engine list with capabilities and missing key names: GET /api/admin/engines (ADMIN_EMAILS only).
      stt: { engine: defaultEngineId(env), configured: listEngines(env).some((e) => e.isDefault && e.enabled), langTagger: c.langTagger },
      translate: { provider: "openrouter", model: c.translateModel, configured: Boolean(env.OPENROUTER_API_KEY) },
      login: c.googleConfigured ? "google" : "google-not-configured",
      privateTest: c.allowlist !== null,
      signupFreeMinutes: c.signupFreeMinutes,
      limits: { maxFileMb: Math.round(c.maxFileBytes / 1024 / 1024), maxDurationMin: Math.round(c.maxDurationSec / 60) },
      breakers: { perUser: c.userDailyLimitUsd > 0, global: c.dailyLimitUsd > 0 },
      alertEmail: Boolean(env.EMAIL && c.alertTo && c.alertFrom),
      turnstile: c.turnstileSecret && c.turnstileSiteKey ? "configured" : "unconfigured",
      channel: c.isPreview ? "preview" : "production",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
