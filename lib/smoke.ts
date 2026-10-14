import type { AppEnv } from "./cf";
import { generateId, nowSeconds, utcDay } from "./cf";
import { NOT_ALLOWED_MESSAGE, accessForUser } from "./access";
import { readConfig } from "./config";
import { readCookie } from "./human-check";
import { getSigningSecret, hmacHex } from "./secrets";
import { userEmail } from "./users";

/**
 * Temporary anonymous smoke path (SMOKE_ANON). Default off.
 * A signed-out browser may run the existing transcribe → translate flow only when the flag is on.
 * Turnstile stays required (fail closed if it is not configured). USD breakers still apply, keyed
 * per IP so a fresh cookie cannot reset the $1/day ledger. A separate per-IP request counter
 * caps how many paid smoke calls one address can start in a UTC day.
 * Transcripts are bound to an HttpOnly cookie and expire in 24 hours. Signed-in allowlist behavior
 * is unchanged: a session never takes this path.
 */
export const SMOKE_COOKIE = "sq_smoke";
export const SMOKE_USER_PREFIX = "smoke:";
export const SMOKE_TTL_SECONDS = 24 * 3600;
/** Paid smoke calls (one transcribe or one translate) allowed per IP per UTC day. */
export const SMOKE_IP_DAILY_CAP = 8;

export const SMOKE_IP_LIMIT_MESSAGE = "This network has reached today's limit for the smoke test. Please try again tomorrow.";
export const SMOKE_IP_MISSING_MESSAGE = "The smoke test could not see a client address, so it was refused.";
export const SMOKE_TURNSTILE_MESSAGE = "The smoke test requires the human check, which is not configured.";
export const SMOKE_SESSION_MESSAGE = "This smoke-test transcript is only available in the browser that uploaded it. Upload the file again.";

export type RequestActor = {
  userId: string;
  email: string | null;
  /** Ledger subject. Signed-in users use their account id; smoke uses a keyed IP so the $1 breaker holds. */
  spendUserId: string;
  smoke: boolean;
  /** Absolute expiry for a smoke transcript. Null on the normal 30-day path. */
  expiresAt: number | null;
  setCookie: string | null;
};

type SmokeFailure = { ok: false; status: number; code: string; error: string };

export function clientIp(req: Request): string | null {
  const ip = (req.headers.get("cf-connecting-ip") || "").trim();
  if (!ip || ip.length > 200) return null;
  return ip;
}

function smokeUserId(sessionId: string): string {
  return `${SMOKE_USER_PREFIX}${sessionId}`;
}

async function signSmoke(id: string, exp: number, secret: string): Promise<string> {
  const sig = (await hmacHex(secret, `smoke:${id}:${exp}`)).slice(0, 32);
  return `${id}.${exp}.${sig}`;
}

export async function verifySmokeValue(value: string | null, secret: string, now = nowSeconds()): Promise<{ id: string; exp: number } | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!/^[0-9a-f]{24}$/.test(id || "") || !sig || !Number.isInteger(exp) || exp < now || exp > now + SMOKE_TTL_SECONDS) return null;
  return (await signSmoke(id, exp, secret)) === `${id}.${exp}.${sig}` ? { id, exp } : null;
}

function smokeSetCookie(value: string, maxAge: number, secure: boolean): string {
  return `${SMOKE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, maxAge)}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

async function ipSpendId(ip: string, secret: string): Promise<string> {
  return `smoke-ip:${(await hmacHex(secret, `smoke-ip:${ip}`)).slice(0, 24)}`;
}

async function openSmoke(req: Request, env: AppEnv, mint: boolean, now = nowSeconds()): Promise<{ ok: true; actor: RequestActor } | SmokeFailure> {
  const c = readConfig(env);
  if (!c.turnstileSecret || !c.turnstileSiteKey) return { ok: false, status: 503, code: "human_check", error: SMOKE_TURNSTILE_MESSAGE };
  const ip = clientIp(req);
  if (!ip) return { ok: false, status: 403, code: "smoke_ip", error: SMOKE_IP_MISSING_MESSAGE };
  const secret = await getSigningSecret(env);
  const existing = await verifySmokeValue(readCookie(req.headers.get("cookie"), SMOKE_COOKIE), secret, now);
  const secure = (() => {
    try {
      return new URL(req.url).protocol === "https:";
    } catch {
      return false;
    }
  })();
  let id: string;
  let exp: number;
  let setCookie: string | null = null;
  if (existing) {
    id = existing.id;
    exp = existing.exp;
  } else if (mint) {
    id = generateId();
    exp = now + SMOKE_TTL_SECONDS;
    setCookie = smokeSetCookie(await signSmoke(id, exp, secret), SMOKE_TTL_SECONDS, secure);
  } else {
    return { ok: false, status: 401, code: "smoke_session", error: SMOKE_SESSION_MESSAGE };
  }
  return {
    ok: true,
    actor: {
      userId: smokeUserId(id),
      email: null,
      spendUserId: await ipSpendId(ip, secret),
      smoke: true,
      expiresAt: exp,
      setCookie,
    },
  };
}

/**
 * Signed-in session wins. Allowlist applies only then.
 * With no session, SMOKE_ANON may mint (transcribe) or resume (read / translate) a smoke actor.
 */
export async function actorForRequest(
  req: Request,
  env: AppEnv,
  sessionId: string | null,
  opts: { enforceAllowlist: boolean; mintSmoke: boolean; signedOutError: string },
  now = nowSeconds()
): Promise<{ ok: true; actor: RequestActor } | SmokeFailure> {
  if (sessionId) {
    if (opts.enforceAllowlist && (await accessForUser(env, sessionId)) === "waitlist") {
      return { ok: false, status: 403, code: "not_allowed", error: NOT_ALLOWED_MESSAGE };
    }
    return {
      ok: true,
      actor: {
        userId: sessionId,
        email: await userEmail(env.DB, sessionId),
        spendUserId: sessionId,
        smoke: false,
        expiresAt: null,
        setCookie: null,
      },
    };
  }
  if (!readConfig(env).smokeAnon) return { ok: false, status: 401, code: "sign_in", error: opts.signedOutError };
  return openSmoke(req, env, opts.mintSmoke, now);
}

/** Resume a smoke browser session for /api/me. Null when the flag is off or there is no valid cookie. */
export async function smokeListUserId(req: Request, env: AppEnv, now = nowSeconds()): Promise<string | null> {
  if (!readConfig(env).smokeAnon) return null;
  if (!readCookie(req.headers.get("cookie"), SMOKE_COOKIE)) return null;
  const opened = await openSmoke(req, env, false, now);
  return opened.ok ? opened.actor.userId : null;
}

const capKey = (ns: string, spendUserId: string) => `${ns}smoke-req:${spendUserId}`;

/**
 * Count one paid smoke call against the IP/day cap. False when the cap is already used.
 * Uses spend_ledger.calls only (micro_usd stays 0) so it does not move the USD breakers.
 */
export async function reserveSmokeRequest(env: AppEnv, spendUserId: string, now = nowSeconds()): Promise<boolean> {
  if (SMOKE_IP_DAILY_CAP <= 0) return false;
  const c = readConfig(env);
  const key = capKey(c.spendNamespace, spendUserId);
  const day = utcDay(now);
  try {
    const res = await env.DB.prepare(
      `INSERT INTO spend_ledger (ledger_key, day, micro_usd, calls, updated_at) VALUES (?, ?, 0, 1, ?)
       ON CONFLICT(ledger_key, day) DO UPDATE SET calls = calls + 1, updated_at = excluded.updated_at
       WHERE spend_ledger.calls < ?`
    )
      .bind(key, day, now, SMOKE_IP_DAILY_CAP)
      .run();
    return Number(res.meta.changes) === 1;
  } catch (e) {
    console.error("[smoke] ip cap", e instanceof Error ? e.message : e);
    return false;
  }
}
