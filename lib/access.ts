import type { AppEnv } from "./cf";
import { readConfig } from "./config";
import { userEmail } from "./users";

/**
 * Debug-phase gate for paid inference (TRANSCRIBE_ALLOWLIST). Public pages are never gated.
 * - "open":     no allowlist; every signed-in account may transcribe (within its minutes).
 * - "allowed":  allowlist active and this account is on it.
 * - "waitlist": allowlist active and this account is not on it.
 */
export type Access = "open" | "allowed" | "waitlist";

export const NOT_ALLOWED_MESSAGE = "Transcription is in a private test right now. This account isn't on the list yet — join the waitlist and we'll let you know.";

export function accessForEmail(allowlist: string[] | null, email: string | null | undefined): Access {
  if (!allowlist) return "open";
  const e = (email || "").trim().toLowerCase();
  return e && allowlist.includes(e) ? "allowed" : "waitlist";
}

export async function accessForUser(env: AppEnv, userId: string): Promise<Access> {
  const allowlist = readConfig(env).allowlist;
  if (!allowlist) return "open";
  return accessForEmail(allowlist, await userEmail(env.DB, userId));
}
