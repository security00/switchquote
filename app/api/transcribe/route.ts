import { generateId, nowSeconds, requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { NOT_ALLOWED_MESSAGE, accessForUser } from "@/lib/access";
import { checkHuman } from "@/lib/human-check";
import { detectDuration, MIME_BY_FORMAT } from "@/lib/duration";
import { balanceSeconds, billableSeconds, chargeSeconds, ensureSignupGrant, refundSeconds } from "@/lib/minutes";
import { BUSY_MESSAGE, USER_LIMIT_MESSAGE, checkAdmission, recordSubmission, settle } from "@/lib/spend";
import { transcribeDeepgram } from "@/lib/providers";
import { segmentsFromDeepgram } from "@/lib/transcript";
import { userEmail } from "@/lib/users";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

const TRANSCRIPT_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Upload → Deepgram Nova-3 (language=multi) → transcript that keeps both languages.
 * Gate order: sign-in (401) → allowlist (403) → Turnstile (403) → size/format/duration (413/415)
 * → minutes (402) → USD breakers (503 global / 429 per-user) → paid call.
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

  await ensureSignupGrant(env, userId);
  const seconds = billableSeconds(detected.seconds);
  const left = await balanceSeconds(env.DB, userId);
  if (left < seconds) {
    return withCookie({ ok: false, code: "no_minutes", error: "Not enough free minutes left on this account for this file.", secondsLeft: Math.max(0, left) }, 402);
  }

  const estimateUsd = (seconds / 60) * c.sttCostPerMinUsd;
  const admission = await checkAdmission(env, userId, estimateUsd);
  if (!admission.ok) {
    return admission.scope === "global"
      ? withCookie({ ok: false, code: "paused", error: BUSY_MESSAGE }, 503)
      : withCookie({ ok: false, code: "user_limit", error: USER_LIMIT_MESSAGE }, 429);
  }
  if (!env.DEEPGRAM_API_KEY) return withCookie({ ok: false, code: "unavailable", error: "Transcription isn't configured yet." }, 503);

  const id = generateId();
  const filename = (file.name || "audio").slice(0, 200);
  const now = nowSeconds();
  await env.DB
    .prepare(
      `INSERT INTO transcripts (id, user_id, status, filename, mime, bytes, duration_sec, engine, created_at, expires_at)
       VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, filename, file.type || MIME_BY_FORMAT[detected.format], file.size, detected.seconds, `deepgram/${c.deepgramModel}`, now, now + TRANSCRIPT_TTL_SECONDS)
    .run();
  await chargeSeconds(env.DB, userId, seconds, id);
  const eventId = await recordSubmission(env, {
    userId,
    email: await userEmail(env.DB, userId),
    kind: "stt",
    provider: "deepgram",
    model: `${c.deepgramModel}/multi`,
    ref: id,
    audioSeconds: detected.seconds,
    estimateUsd,
  });

  const result = await transcribeDeepgram(env.DEEPGRAM_API_KEY, c.deepgramModel, audio, MIME_BY_FORMAT[detected.format]);
  if (!result.ok) {
    await settle(env, eventId, { status: "failed", httpStatus: result.httpStatus, actualUsd: null, costSource: "estimate" });
    await refundSeconds(env.DB, userId, seconds, id);
    await env.DB.prepare(`UPDATE transcripts SET status = 'failed', error = ? WHERE id = ?`).bind(result.error.slice(0, 300), id).run();
    console.error("[transcribe] provider failed", result.httpStatus, result.error);
    return withCookie({ ok: false, code: "provider_failed", error: "Transcription failed. Your minutes were not used." }, 502);
  }
  const actualSec = result.durationSec ?? detected.seconds;
  await settle(env, eventId, {
    status: "ok",
    httpStatus: result.httpStatus,
    actualUsd: (actualSec / 60) * c.sttCostPerMinUsd,
    costSource: "list_price_x_provider_duration",
    audioSeconds: actualSec,
  });
  const segments = segmentsFromDeepgram(result.body);
  await env.DB.prepare(`UPDATE transcripts SET status = 'done', segments_json = ? WHERE id = ?`).bind(JSON.stringify(segments), id).run();
  return withCookie({ ok: true, id }, 200);
}
