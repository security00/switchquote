import { requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { checkHuman } from "@/lib/human-check";
import { BUSY_MESSAGE, USER_LIMIT_MESSAGE, checkAdmission, recordSubmission, settle } from "@/lib/spend";
import { MAX_TRANSLATE_WORDS, translateEstimateUsd, translateSegments } from "@/lib/providers";
import { loadTranscript } from "@/lib/store";
import { translationIsComplete } from "@/lib/transcript";
import { SMOKE_IP_LIMIT_MESSAGE, actorForRequest, reserveSmokeRequest } from "@/lib/smoke";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Opt-in "Translate to English": a separate English reference column. The original is never changed. */
export async function POST(req: Request, ctx: RouteContext<"/api/transcripts/[id]/translate">) {
  const env = await requireEnv();
  const c = readConfig(env);
  const resolved = await actorForRequest(req, env, await sessionUserId(), {
    enforceAllowlist: true,
    mintSmoke: false,
    signedOutError: "Sign in with Google.",
  });
  if (!resolved.ok) return fail(resolved.status, resolved.code, resolved.error);
  const actor = resolved.actor;
  const human = await checkHuman(req, env, actor.smoke ? actor.userId : `user:${actor.userId}`, req.headers.get("x-turnstile-token"));
  if (!human.ok) return fail(403, "human_check", human.error);
  const cookies = [human.setCookie, actor.setCookie].filter((cookie): cookie is string => Boolean(cookie));

  const { id } = await ctx.params;
  const t = await loadTranscript(env.DB, actor.userId, id);
  if (!t || t.status !== "done") return fail(404, "not_found", "Transcript not found.");
  if (translationIsComplete(t.segments, t.translation)) return json({ ok: true, translation: t.translation }, 200, cookies);

  const words = t.segments.reduce((n, s) => n + s.words.length, 0);
  if (words > MAX_TRANSLATE_WORDS) return json({ ok: false, code: "too_long", error: "This transcript is too long to translate in one go." }, 413, cookies);
  const estimateUsd = translateEstimateUsd(words);
  const admission = await checkAdmission(env, actor.spendUserId, estimateUsd);
  if (!admission.ok) {
    return admission.scope === "global"
      ? json({ ok: false, code: "paused", error: BUSY_MESSAGE }, 503, cookies)
      : json({ ok: false, code: "user_limit", error: USER_LIMIT_MESSAGE }, 429, cookies);
  }
  if (!env.OPENROUTER_API_KEY) return json({ ok: false, code: "unavailable", error: "Translation isn't configured yet." }, 503, cookies);
  if (actor.smoke && !(await reserveSmokeRequest(env, actor.spendUserId))) {
    return json({ ok: false, code: "smoke_ip_limit", error: SMOKE_IP_LIMIT_MESSAGE }, 429, cookies);
  }

  const eventId = await recordSubmission(env, {
    userId: actor.spendUserId,
    email: actor.email,
    kind: "translate",
    engine: "translate",
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
    costSource: "provider_returned",
  });
  if (!result.ok) {
    console.error("[translate] failed", result.httpStatus, result.error);
    return json({ ok: false, code: "provider_failed", error: "Translation failed. Please try again." }, 502, cookies);
  }
  await env.DB.prepare(`UPDATE transcripts SET translation_json = ? WHERE id = ? AND user_id = ?`).bind(JSON.stringify(result.lines), id, actor.userId).run();
  return json({ ok: true, translation: result.lines }, 200, cookies);
}
