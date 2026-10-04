import type { AppEnv } from "./cf";
import { generateId, nowSeconds } from "./cf";
import { readConfig } from "./config";
import { accessForUser } from "./access";

/** Seconds left for a user: one-time grant + refunds − charges. */
export async function balanceSeconds(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(SUM(seconds), 0) AS s FROM minute_ledger WHERE user_id = ?`).bind(userId).first<{ s: number }>();
  return Number(row?.s || 0);
}

/**
 * One-time signup grant (SIGNUP_FREE_MINUTES, lifetime). While the allowlist is active only
 * allowed accounts get it; a waitlisted account receives it on the first visit after it's allowed.
 * Idempotent through the unique (user_id) WHERE kind='grant' index.
 */
export async function ensureSignupGrant(env: AppEnv, userId: string): Promise<boolean> {
  const minutes = readConfig(env).signupFreeMinutes;
  if (minutes <= 0) return false;
  if ((await accessForUser(env, userId)) === "waitlist") return false;
  const res = await env.DB
    .prepare(`INSERT OR IGNORE INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES (?, ?, 'grant', ?, NULL, ?)`)
    .bind(generateId(), userId, Math.round(minutes * 60), nowSeconds())
    .run();
  return res.meta.changes === 1;
}

/** Billable seconds for a file: whole seconds, rounded up, at least 1. */
export const billableSeconds = (durationSec: number) => Math.max(1, Math.ceil(durationSec));

export async function chargeSeconds(db: D1Database, userId: string, seconds: number, ref: string) {
  await db
    .prepare(`INSERT OR IGNORE INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES (?, ?, 'charge', ?, ?, ?)`)
    .bind(generateId(), userId, -Math.abs(seconds), ref, nowSeconds())
    .run();
}

export async function refundSeconds(db: D1Database, userId: string, seconds: number, ref: string) {
  await db
    .prepare(`INSERT OR IGNORE INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES (?, ?, 'refund', ?, ?, ?)`)
    .bind(generateId(), userId, Math.abs(seconds), ref, nowSeconds())
    .run();
}
