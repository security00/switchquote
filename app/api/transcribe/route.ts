import { generateId, nowSeconds, requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { checkHuman } from "@/lib/human-check";
import { detectDuration, MIME_BY_FORMAT } from "@/lib/duration";
import { creditsFromUnits, billableUnits } from "@/lib/credit-units";
import { balanceUnits, chargeCredits, ensureSignupGrant, ensureSubscriptionGrants, refundCredits } from "@/lib/credits";
import { BUSY_MESSAGE, USER_LIMIT_MESSAGE, checkAdmission, recordSubmission, settle } from "@/lib/spend";
import { bilingualPrimary, chooseEngine, getEngine } from "@/lib/engines/registry";
import { tagEstimateUsd } from "@/lib/langtag";
import { chooseVerifyMode, verifySwitchTranscript } from "@/lib/switch-verify";
import { flagLowConfidence, languagesForSwitches, switchWindows } from "@/lib/switch-points";
import { SMOKE_IP_LIMIT_MESSAGE, actorForRequest, reserveSmokeRequest } from "@/lib/smoke";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

const TRANSCRIPT_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Upload → speech engine. When both AssemblyAI and Deepgram keys exist, AssemblyAI is the transcript
 * and Deepgram is only a cross-check. Deepgram language tags are not used for switches; language comes
 * from the lexical tagger (lib/langtag.ts) unless another engine already returned both languages.
 * Disagreement and low confidence are marked Review suggested. An LLM may attach a one-token suggestion
 * the reader accepts; it does not change the words. Missing keys skip that pass. The transcript still saves.
 * Gate order: sign-in, or SMOKE_ANON for signed-out browsers (401) → allowlist for signed-in users (403)
 * → Turnstile (403) → size/format/duration (413/415) → engine choice (admin-only override, 403/503)
 * → credits for signed-in users (402) → USD breakers (503 / 429) → smoke IP/day cap (429) → paid call(s).
 * Audio is never stored; it is streamed to the STT provider and dropped.
 * SMOKE_ANON does not skip Turnstile or the breakers, does not charge credits, and does not relax the allowlist.
 */
export async function POST(req: Request) {
  const env = await requireEnv();
  const c = readConfig(env);

  const resolved = await actorForRequest(req, env, await sessionUserId(), {
    enforceAllowlist: true,
    mintSmoke: true,
    signedOutError: "Sign in with Google to transcribe.",
  });
  if (!resolved.ok) return fail(resolved.status, resolved.code, resolved.error);
  const actor = resolved.actor;

  const human = await checkHuman(req, env, actor.smoke ? actor.userId : `user:${actor.userId}`, req.headers.get("x-turnstile-token"));
  if (!human.ok) return fail(403, "human_check", human.error);
  const cookies = [human.setCookie, actor.setCookie].filter((cookie): cookie is string => Boolean(cookie));
  const withCookie = (body: unknown, status: number) => json(body, status, cookies);

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > c.maxFileBytes + 1024 * 1024) {
    return withCookie({ ok: false, code: "too_large", error: `Files up to ${Math.round(c.maxFileBytes / 1024 / 1024)} MB for now.` }, 413);
  }
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return withCookie({ ok: false, code: "bad_request", error: "Upload one audio file." }, 400);
  }
  if (!file || file.size === 0) return withCookie({ ok: false, code: "bad_request", error: "Upload one audio file." }, 400);
  if (file.size > c.maxFileBytes) {
    return withCookie({ ok: false, code: "too_large", error: `Files up to ${Math.round(c.maxFileBytes / 1024 / 1024)} MB for now.` }, 413);
  }
  const audio = await file.arrayBuffer();
  const detected = detectDuration(audio);
  if (!detected) {
    return withCookie({ ok: false, code: "unsupported", error: "Use MP3, M4A, MP4, WAV, OGG or FLAC. We couldn't read this file's length." }, 415);
  }
  if (detected.seconds > c.maxDurationSec) {
    return withCookie({ ok: false, code: "too_long", error: `Recordings up to ${Math.round(c.maxDurationSec / 60)} minutes for now.` }, 413);
  }

  const requestedEngine = req.headers.get("x-sq-engine");
  const choice = bilingualPrimary(env, chooseEngine(env, actor.email, requestedEngine), requestedEngine);
  if (!choice.ok) return withCookie({ ok: false, code: choice.code, error: choice.error }, choice.status);
  const engine = choice.engine;
  if (engine.maxBytes && file.size > engine.maxBytes) {
    return withCookie({ ok: false, code: "too_large", error: `Files up to ${Math.round(engine.maxBytes / 1024 / 1024)} MB for now.` }, 413);
  }

  const units = billableUnits(detected.seconds);
  if (!actor.smoke) {
    await ensureSignupGrant(env, actor.userId);
    await ensureSubscriptionGrants(env.DB, actor.userId);
    const left = await balanceUnits(env.DB, actor.userId);
    if (left < units) {
      return withCookie({ ok: false, code: "no_credits", error: "Not enough credits left on this account for this file.", creditsLeft: Math.max(0, creditsFromUnits(left)) }, 402);
    }
  }

  const sttEstimateUsd = (units / 60) * engine.listUsdPerMin(env);
  const tagEstimate = 0;
  const verifyPlan = chooseVerifyMode(env, engine.id);
  const secondaryEngine = verifyPlan.secondaryId ? getEngine(verifyPlan.secondaryId) : undefined;
  const verifyEstimate =
    verifyPlan.mode === "cross" && secondaryEngine
      ? (units / 60) * secondaryEngine.listUsdPerMin(env)
      : verifyPlan.mode === "llm"
        ? Math.min(0.02, tagEstimateUsd(units))
        : 0;
  let runVerify = verifyPlan.mode !== "skip" && verifyEstimate > 0;
  const baseEstimate = sttEstimateUsd + tagEstimate;
  let admission = await checkAdmission(env, actor.spendUserId, baseEstimate + (runVerify ? verifyEstimate : 0), undefined, runVerify);
  if (!admission.ok && runVerify) {
    runVerify = false;
    admission = await checkAdmission(env, actor.spendUserId, baseEstimate);
  }
  if (!admission.ok) {
    return admission.scope === "global"
      ? withCookie({ ok: false, code: "paused", error: BUSY_MESSAGE }, 503)
      : withCookie({ ok: false, code: "user_limit", error: USER_LIMIT_MESSAGE }, 429);
  }

  if (actor.smoke && !(await reserveSmokeRequest(env, actor.spendUserId))) {
    return withCookie({ ok: false, code: "smoke_ip_limit", error: SMOKE_IP_LIMIT_MESSAGE }, 429);
  }

  const id = generateId();
  const filename = (file.name || "audio").slice(0, 200);
  const now = nowSeconds();
  const model = engine.model(env);
  const expiresAt = actor.smoke && actor.expiresAt ? actor.expiresAt : now + TRANSCRIPT_TTL_SECONDS;
  await env.DB
    .prepare(
      `INSERT INTO transcripts (id, user_id, status, filename, mime, bytes, duration_sec, engine, created_at, expires_at)
       VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, actor.userId, filename, file.type || MIME_BY_FORMAT[detected.format], file.size, detected.seconds, `${engine.id}/${model}`, now, expiresAt)
    .run();
  if (!actor.smoke) {
    const charged = await chargeCredits(env.DB, actor.userId, units, id);
    if (!charged.ok) {
      await env.DB.prepare(`DELETE FROM transcripts WHERE id = ? AND user_id = ?`).bind(id, actor.userId).run();
      return withCookie({ ok: false, code: "no_credits", error: "Not enough credits left on this account for this file.", creditsLeft: Math.max(0, creditsFromUnits(charged.unitsLeft)) }, 402);
    }
  }
  const sttEvent = await recordSubmission(env, {
    userId: actor.spendUserId,
    email: actor.email,
    kind: "stt",
    engine: engine.id,
    provider: `${engine.id}:${engine.route(env)}`,
    model,
    ref: id,
    audioSeconds: detected.seconds,
    estimateUsd: sttEstimateUsd,
  });

  const referer = new URL(req.url).origin;
  const result = await engine.transcribe({ audio, mime: MIME_BY_FORMAT[detected.format], format: detected.format, detectedSec: detected.seconds, env, referer });
  if (!result.ok) {
    await settle(env, sttEvent, { status: "failed", httpStatus: result.httpStatus, actualUsd: result.cost?.usd ?? null, costSource: result.cost?.source ?? "estimate" });
    if (!actor.smoke) await refundCredits(env.DB, actor.userId, units, id);
    await env.DB.prepare(`UPDATE transcripts SET status = 'failed', error = ? WHERE id = ?`).bind(result.error.slice(0, 300), id).run();
    console.error("[transcribe] engine failed", engine.id, result.httpStatus, result.error);
    return withCookie(
      { ok: false, code: "provider_failed", error: actor.smoke ? "Transcription failed. Please try again." : "Transcription failed. Your credits were not used." },
      502
    );
  }
  await settle(env, sttEvent, { status: "ok", httpStatus: result.httpStatus, actualUsd: result.cost.usd, costSource: result.cost.source, audioSeconds: result.durationSec, model: result.model });

  const labeled = languagesForSwitches(result.segments, engine.id);
  let segments = flagLowConfidence(labeled.segments);
  let langTags = labeled.method === "lexical" ? "lexical" : result.languageTags;
  if (runVerify && switchWindows(segments).length) {
    try {
      const verified = await verifySwitchTranscript(segments, {
        crossCheck:
          verifyPlan.mode === "cross" && secondaryEngine
            ? async () => {
                const estimate = (result.durationSec / 60) * secondaryEngine.listUsdPerMin(env);
                const eventId = await recordSubmission(env, {
                  userId: actor.spendUserId,
                  email: actor.email,
                  kind: "stt",
                  engine: secondaryEngine.id,
                  provider: `${secondaryEngine.id}:${secondaryEngine.route(env)}:verify`,
                  model: secondaryEngine.model(env),
                  ref: id,
                  audioSeconds: result.durationSec,
                  estimateUsd: estimate,
                });
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), 20_000);
                try {
                  const second = await secondaryEngine.transcribe({
                    audio,
                    mime: MIME_BY_FORMAT[detected.format],
                    format: detected.format,
                    detectedSec: detected.seconds,
                    env,
                    referer,
                    signal: ac.signal,
                  });
                  await settle(env, eventId, {
                    status: second.ok ? "ok" : "failed",
                    httpStatus: second.httpStatus,
                    actualUsd: second.ok ? second.cost.usd : (second.cost?.usd ?? null),
                    costSource: second.ok ? second.cost.source : (second.cost?.source ?? "estimate"),
                    audioSeconds: second.ok ? second.durationSec : null,
                    model: second.ok ? second.model : null,
                  });
                  return second.ok ? languagesForSwitches(second.segments, secondaryEngine.id).segments : null;
                } catch (e) {
                  await settle(env, eventId, { status: "failed", httpStatus: null, actualUsd: null, costSource: "estimate" });
                  console.error("[transcribe] verify cross-check", e instanceof Error ? e.message : e);
                  return null;
                } finally {
                  clearTimeout(timer);
                }
              }
            : undefined,
        llm: verifyPlan.llm
          ? {
              provider: verifyPlan.llm,
              apiKey: verifyPlan.llm === "openrouter" ? String(env.OPENROUTER_API_KEY) : String(env.GOOGLE_API_KEY),
              model: verifyPlan.llm === "openrouter" ? c.langTaggerModel : (env.GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash",
              referer,
            }
          : null,
        spendLlm: async (job) => {
          const eventId = await recordSubmission(env, {
            userId: actor.spendUserId,
            email: actor.email,
            kind: "tag",
            engine: "switch-verify",
            provider: verifyPlan.llm === "google" ? "google" : "openrouter",
            model: verifyPlan.llm === "openrouter" ? c.langTaggerModel : (env.GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash",
            ref: id,
            audioSeconds: result.durationSec,
            estimateUsd: job.estimateUsd,
          });
          try {
            const out = await job.run();
            await settle(env, eventId, {
              status: out.ok ? "ok" : "failed",
              httpStatus: out.httpStatus,
              actualUsd: out.cost?.usd ?? (out.ok ? null : 0),
              costSource: out.cost?.source ?? "estimate",
            });
            return out;
          } catch (e) {
            await settle(env, eventId, { status: "failed", httpStatus: null, actualUsd: null, costSource: "estimate" });
            throw e;
          }
        },
      });
      if (verified.method !== "skipped") {
        segments = verified.segments;
        langTags = `${langTags}+verify:${verified.method}`;
      }
      if (verified.error) console.error("[transcribe] verify", verified.error);
    } catch (e) {
      console.error("[transcribe] verify", e instanceof Error ? e.message : e);
    }
  }
  await env.DB.prepare(`UPDATE transcripts SET status = 'done', segments_json = ?, lang_tags = ? WHERE id = ?`).bind(JSON.stringify(segments), langTags, id).run();
  return withCookie({ ok: true, id, ...(choice.overridden ? { engine: engine.id, langTags } : {}) }, 200);
}
