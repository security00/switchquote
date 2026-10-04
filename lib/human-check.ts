import type { AppEnv } from "./cf";
import { readConfig } from "./config";
import { getSigningSecret, hmacHex } from "./secrets";
import { TURNSTILE_TEST_SECRET_ALWAYS_FAIL, TURNSTILE_TEST_SECRET_ALWAYS_PASS, verifyTurnstile } from "./turnstile";

/**
 * Turnstile gate for paid calls (pattern from crayonink). A passed challenge is remembered for
 * HUMAN_PASS_SECONDS in a signed HttpOnly cookie bound to the user, so Translate after a
 * transcription doesn't need a second widget solve. Inert only when no secret is configured.
 */
export const HUMAN_COOKIE = "sq_human";
export const HUMAN_PASS_SECONDS = 30 * 60;
export const TURNSTILE_ACTION = "transcribe";

function expectedHostnameFor(req: Request, secret: string): string | null {
  if (secret === TURNSTILE_TEST_SECRET_ALWAYS_PASS || secret === TURNSTILE_TEST_SECRET_ALWAYS_FAIL) return null;
  try {
    return new URL(req.url).hostname;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const t = part.trim();
    const eq = t.indexOf("=");
    if (eq > 0 && t.slice(0, eq) === name) return decodeURIComponent(t.slice(eq + 1));
  }
  return null;
}

export async function signHumanPass(owner: string, expires: number, secret: string) {
  return `${expires}.${(await hmacHex(secret, `human:${owner}:${expires}`)).slice(0, 32)}`;
}

export async function verifyHumanPass(value: string | null, owner: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!value) return false;
  const dot = value.indexOf(".");
  const expires = Number(value.slice(0, dot));
  if (dot <= 0 || !Number.isInteger(expires) || expires < now || expires > now + HUMAN_PASS_SECONDS) return false;
  return (await signHumanPass(owner, expires, secret)) === value;
}

export type HumanCheck = { ok: true; setCookie: string | null } | { ok: false; error: string };

export async function checkHuman(
  req: Request,
  env: AppEnv,
  owner: string,
  token: string | null,
  opts: { fetchFn?: typeof fetch; now?: number } = {}
): Promise<HumanCheck> {
  const secretKey = readConfig(env).turnstileSecret;
  if (!secretKey) return { ok: true, setCookie: null };
  const secret = await getSigningSecret(env);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (await verifyHumanPass(readCookie(req.headers.get("cookie"), HUMAN_COOKIE), owner, secret, now)) {
    return { ok: true, setCookie: null };
  }
  const verification = await verifyTurnstile({
    token,
    secretKey,
    remoteIp: req.headers.get("cf-connecting-ip"),
    expectedHostname: expectedHostnameFor(req, secretKey),
    expectedAction: TURNSTILE_ACTION,
    fetchFn: opts.fetchFn,
  });
  if (!verification.ok) {
    return {
      ok: false,
      error: verification.status === "missing" ? "Please complete the quick human check, then try again." : verification.error || "Human verification failed.",
    };
  }
  const value = await signHumanPass(owner, now + HUMAN_PASS_SECONDS, secret);
  const secure = new URL(req.url).protocol === "https:";
  return { ok: true, setCookie: `${HUMAN_COOKIE}=${value}; Path=/; Max-Age=${HUMAN_PASS_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}
