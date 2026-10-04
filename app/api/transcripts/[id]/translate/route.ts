import { requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { NOT_ALLOWED_MESSAGE, accessForUser } from "@/lib/access";
import { checkHuman } from "@/lib/human-check";
import { BUSY_MESSAGE, USER_LIMIT_MESSAGE, checkAdmission, recordSubmission, settle } from "@/lib/spend";
import { MAX_TRANSLATE_WORDS, translateEstimateUsd, translateSegments } from "@/lib/providers";
import { loadTranscript } from "@/lib/store";
import { userEmail } from "@/lib/users";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Opt-in "Translate to English": a separate English reference column. The original is never changed. */
export async function POST(req: Request, ctx: RouteContext<"/api/transcripts/[id]/translate">) {
  const env = await requireEnv();
  const c = readConfig(env);
  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in with Google.");
  if ((await accessForUser(env, userId)) === "waitlist") return fail(403, "not_allowed", NOT_ALLOWED_MESSAGE);
  const human = await checkHuman(req, env, `user:${userId}`, req.headers.get("x-turnstile-token"));
  if (!human.ok) return fail(403, "human_check", human.error);

  const { id } = await ctx.params;
  const t = await loadTranscript(env.DB, userId, id);
  if (!t || t.status !== "done") return fail(404, "not_found", "Transcript not found.");
  if (t.translation) return json({ ok: true, translation: t.translation }, 200, human.setCookie);

  const words = t.segments.reduce((n, s) => n + s.words.length, 0);
  if (words > MAX_TRANSLATE_WORDS) return json({ ok: false, code: "too_long", error: "This transcript is too long to translate in one go." }, 413, human.setCookie);
  const estimateUsd = translateEstimateUsd(words);
  const admission = await checkAdmission(env, userId, estimateUsd);
  if (!admission.ok) {
    return admission.scope === "global"
      ? json({ ok: false, code: "paused", error: BUSY_MESSAGE }, 503, human.setCookie)
      : json({ ok: false, code: "user_limit", error: USER_LIMIT_MESSAGE }, 429, human.setCookie);
  }
  if (!env.OPENROUTER_API_KEY) return json({ ok: false, code: "unavailable", error: "Translation isn't configured yet." }, 503, human.setCookie);

  const eventId = await recordSubmission(env, {
    userId,
    email: await userEmail(env.DB, userId),
    kind: "translate",
    provider: "openrouter",
    model: c.translateModel,
    ref: id,
    audioSeconds: null,
    estimateUsd,
  });
  const result = await translateSegments(env.OPENROUTER_API_KEY, c.translateModel, t.segments, new URL(req.url).origin);
  await settle(env, eventId, {
    status: result.ok ? "ok" : "failed",
    httpStatus: result.httpStatus,
    actualUsd: result.costUsd,
    costSource: "openrouter_usage_cost",
  });
  if (!result.ok) {
    console.error("[translate] failed", result.httpStatus, result.error);
    return json({ ok: false, code: "provider_failed", error: "Translation failed. Please try again." }, 502, human.setCookie);
  }
  await env.DB.prepare(`UPDATE transcripts SET translation_json = ? WHERE id = ? AND user_id = ?`).bind(JSON.stringify(result.lines), id, userId).run();
  return json({ ok: true, translation: result.lines }, 200, human.setCookie);
}
