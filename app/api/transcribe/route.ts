import { generateId, nowSeconds, requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { NOT_ALLOWED_MESSAGE, accessForUser } from "@/lib/access";
import { checkHuman } from "@/lib/human-check";
import { detectDuration, MIME_BY_FORMAT } from "@/lib/duration";
import { balanceSeconds, billableSeconds, chargeSeconds, ensureSignupGrant, refundSeconds } from "@/lib/minutes";
import { BUSY_MESSAGE, USER_LIMIT_MESSAGE, checkAdmission, recordSubmission, settle } from "@/lib/spend";
import { chooseEngine } from "@/lib/engines/registry";
import { tagEstimateUsd, tagLanguages } from "@/lib/langtag";
import { userEmail } from "@/lib/users";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

const TRANSCRIPT_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Upload → configured engine (default Deepgram Nova-3 multi; see lib/engines) → transcript that keeps
 * both languages; engines without per-word language get the fallback switch detector (lib/langtag.ts).
 * Gate order: sign-in (401) → allowlist (403) → Turnstile (403) → size/format/duration (413/415)
 * → engine choice (admin-only override, 403/503) → minutes (402) → USD breakers (503 / 429) → paid call(s).
 * Audio is never stored; it is streamed to the STT provider and dropped.
 */
export async function POST(req: Request) {
  const env = await requireEnv();
  const c = readConfig(env);

  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in with Google to transcribe.");
  if ((await accessForUser(env, userId)) === "waitlist") return fail(403, "not_allowed", NOT_ALLOWED_MESSAGE);

  const human = await checkHuman(req, env, `user:${userId}`, req.headers.get("x-turnstile-token"));
  if (!human.ok) return fail(403, "human_check", human.error);
  const withCookie = (body: unknown, status: number) => json(body, status, human.setCookie);

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

  const email = await userEmail(env.DB, userId);
  const choice = chooseEngine(env, email, req.headers.get("x-sq-engine"));
  if (!choice.ok) return withCookie({ ok: false, code: choice.code, error: choice.error }, choice.status);
  const engine = choice.engine;
  if (engine.maxBytes && file.size > engine.maxBytes) {
    return withCookie({ ok: false, code: "too_large", error: `Files up to ${Math.round(engine.maxBytes / 1024 / 1024)} MB for now.` }, 413);
  }

  await ensureSignupGrant(env, userId);
  const seconds = billableSeconds(detected.seconds);
  const left = await balanceSeconds(env.DB, userId);
  if (left < seconds) {
    return withCookie({ ok: false, code: "no_minutes", error: "Not enough free minutes left on this account for this file.", secondsLeft: Math.max(0, left) }, 402);
  }

  const needsTagger = engine.caps.languageTags === "none" && c.langTagger === "llm" && Boolean(env.OPENROUTER_API_KEY);
  const sttEstimateUsd = (seconds / 60) * engine.listUsdPerMin(env);
  const tagEstimate = needsTagger ? tagEstimateUsd(seconds) : 0;
  const admission = await checkAdmission(env, userId, sttEstimateUsd + tagEstimate);
  if (!admission.ok) {
    return admission.scope === "global"
      ? withCookie({ ok: false, code: "paused", error: BUSY_MESSAGE }, 503)
      : withCookie({ ok: false, code: "user_limit", error: USER_LIMIT_MESSAGE }, 429);
  }

  const id = generateId();
  const filename = (file.name || "audio").slice(0, 200);
  const now = nowSeconds();
  const model = engine.model(env);
  await env.DB
    .prepare(
      `INSERT INTO transcripts (id, user_id, status, filename, mime, bytes, duration_sec, engine, created_at, expires_at)
       VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, filename, file.type || MIME_BY_FORMAT[detected.format], file.size, detected.seconds, `${engine.id}/${model}`, now, now + TRANSCRIPT_TTL_SECONDS)
    .run();
  await chargeSeconds(env.DB, userId, seconds, id);
  const sttEvent = await recordSubmission(env, {
    userId,
    email,
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
    await refundSeconds(env.DB, userId, seconds, id);
    await env.DB.prepare(`UPDATE transcripts SET status = 'failed', error = ? WHERE id = ?`).bind(result.error.slice(0, 300), id).run();
    console.error("[transcribe] engine failed", engine.id, result.httpStatus, result.error);
    return withCookie({ ok: false, code: "provider_failed", error: "Transcription failed. Your minutes were not used." }, 502);
  }
  await settle(env, sttEvent, { status: "ok", httpStatus: result.httpStatus, actualUsd: result.cost.usd, costSource: result.cost.source, audioSeconds: result.durationSec, model: result.model });

  let segments = result.segments;
  let langTags: string = result.languageTags;
  if (result.languageTags === "none") {
    // Fallback switch detector so highlights work on engines without per-word language.
    const tagEvent = needsTagger
      ? await recordSubmission(env, { userId, email, kind: "tag", engine: "langtag", provider: "openrouter", model: c.langTaggerModel, ref: id, audioSeconds: result.durationSec, estimateUsd: tagEstimate })
      : null;
    const tagged = await tagLanguages(segments, { mode: needsTagger ? "llm" : c.langTagger === "off" ? "off" : "heuristic", apiKey: env.OPENROUTER_API_KEY, model: c.langTaggerModel, referer });
    if (tagEvent) {
      await settle(env, tagEvent, {
        status: tagged.method === "heuristic" ? "failed" : "ok",
        httpStatus: tagged.httpStatus,
        // No cost reported (call never reached the model) → nothing was charged.
        actualUsd: tagged.cost?.usd ?? (tagged.httpStatus && tagged.httpStatus < 300 ? null : 0),
        costSource: tagged.cost?.source ?? "estimate",
      });
    }
    if (tagged.error) console.error("[transcribe] tagger", tagged.error);
    segments = tagged.segments;
    langTags = `fallback:${tagged.method}`;
  }
  await env.DB.prepare(`UPDATE transcripts SET status = 'done', segments_json = ?, lang_tags = ? WHERE id = ?`).bind(JSON.stringify(segments), langTags, id).run();
  return withCookie({ ok: true, id, ...(choice.overridden ? { engine: engine.id, langTags } : {}) }, 200);
}
