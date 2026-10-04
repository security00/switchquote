import { getEnv, nowSeconds, runInBackground } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { accessForUser } from "@/lib/access";
import { balanceSeconds, ensureSignupGrant } from "@/lib/minutes";
import { userEmail } from "@/lib/users";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Who am I + what the upload form needs. Never exposes spend numbers. */
export async function GET() {
  const env = await getEnv();
  if (!env) return fail(503, "unavailable", "Service unavailable.");
  const c = readConfig(env);
  const base = {
    googleConfigured: c.googleConfigured,
    turnstileSiteKey: c.turnstileSiteKey || null,
    limits: { maxFileMb: Math.round(c.maxFileBytes / 1024 / 1024), maxDurationMin: Math.round(c.maxDurationSec / 60) },
    privateTest: c.allowlist !== null,
  };
  // Retention: transcripts expire after 30 days (audio is never stored).
  await runInBackground(env.DB.prepare(`DELETE FROM transcripts WHERE expires_at < ?`).bind(nowSeconds()).run());
  const userId = await sessionUserId();
  if (!userId) return json({ ...base, signedIn: false });
  const access = await accessForUser(env, userId);
  if (access !== "waitlist") await ensureSignupGrant(env, userId);
  const recent = await env.DB
    .prepare(`SELECT id, filename, duration_sec, status, created_at FROM transcripts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`)
    .bind(userId)
    .all<{ id: string; filename: string; duration_sec: number; status: string; created_at: number }>();
  return json({
    ...base,
    signedIn: true,
    email: await userEmail(env.DB, userId),
    access,
    secondsLeft: Math.max(0, await balanceSeconds(env.DB, userId)),
    transcripts: recent.results || [],
  });
}
