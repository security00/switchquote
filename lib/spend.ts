import type { AppEnv } from "./cf";
import { generateId, nowSeconds, utcDay } from "./cf";
import { readConfig } from "./config";
import { sendAlert } from "./alerts";

/**
 * Backend USD breakers (visitors never see spend numbers).
 * - Global daily ledger (DAILY_SPEND_LIMIT_USD) and per-user daily ledger (USER_DAILY_SPEND_LIMIT_USD), UTC day.
 * - Admission: a paid call is refused when today's spend + this call's estimate would exceed a limit.
 * - Every paid call is written to spend_events at submission (estimate) and settled after the
 *   provider answers (actual). Spend is never taken back, even when the call fails.
 * - Alerts: global 80% and 100%, per-user 100%, once per ledger per day.
 */
export const MICRO = 1_000_000;
export const toMicro = (usd: number) => Math.round(usd * MICRO);

export const BUSY_MESSAGE = "Transcription is paused for today. Please try again tomorrow.";
export const USER_LIMIT_MESSAGE = "You've reached today's processing limit for this account. Please try again tomorrow.";

const globalKey = (ns: string) => `${ns}global`;
const userKey = (ns: string, userId: string) => `${ns}user:${userId}`;

async function spent(db: D1Database, key: string, day: string): Promise<number> {
  const row = await db.prepare(`SELECT micro_usd FROM spend_ledger WHERE ledger_key = ? AND day = ?`).bind(key, day).first<{ micro_usd: number }>();
  return Number(row?.micro_usd || 0);
}

export type Admission = { ok: true } | { ok: false; scope: "global" | "user" };

export function admit(globalSpent: number, userSpent: number, estimate: number, globalLimit: number, userLimit: number): Admission {
  if (globalSpent + estimate > globalLimit) return { ok: false, scope: "global" };
  if (userSpent + estimate > userLimit) return { ok: false, scope: "user" };
  return { ok: true };
}

export async function checkAdmission(env: AppEnv, userId: string, estimateUsd: number, now = nowSeconds()): Promise<Admission> {
  const c = readConfig(env);
  const day = utcDay(now);
  const [g, u] = await Promise.all([spent(env.DB, globalKey(c.spendNamespace), day), spent(env.DB, userKey(c.spendNamespace, userId), day)]);
  const res = admit(g, u, toMicro(estimateUsd), toMicro(c.dailyLimitUsd), toMicro(c.userDailyLimitUsd));
  if (!res.ok) {
    // A refused call is the moment a breaker is "tripped" for the operator; alert once per day.
    await maybeAlert(env, res.scope === "global" ? globalKey(c.spendNamespace) : userKey(c.spendNamespace, userId), day, res.scope, res.scope === "global" ? c.dailyLimitUsd : c.userDailyLimitUsd, now, true);
  }
  return res;
}

async function addLedger(db: D1Database, key: string, day: string, micro: number, calls: number, ts: number) {
  await db
    .prepare(
      `INSERT INTO spend_ledger (ledger_key, day, micro_usd, calls, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ledger_key, day) DO UPDATE SET micro_usd = micro_usd + excluded.micro_usd, calls = calls + excluded.calls, updated_at = excluded.updated_at`
    )
    .bind(key, day, micro, calls, ts)
    .run();
}

async function maybeAlert(env: AppEnv, key: string, day: string, scope: "global" | "user", limitUsd: number, ts: number, refused = false) {
  if (limitUsd <= 0) return;
  const row = await env.DB.prepare(`SELECT micro_usd, calls FROM spend_ledger WHERE ledger_key = ? AND day = ?`).bind(key, day).first<{ micro_usd: number; calls: number }>();
  const micro = Number(row?.micro_usd || 0);
  const levels: Array<{ level: "100%" | "80%"; column: "alert100_at" | "alert80_at"; hit: boolean }> = [
    { level: "100%", column: "alert100_at", hit: refused || micro >= toMicro(limitUsd) },
    ...(scope === "global" ? [{ level: "80%" as const, column: "alert80_at" as const, hit: micro >= Math.floor(toMicro(limitUsd) * 0.8) }] : []),
  ];
  for (const l of levels) {
    if (!l.hit) continue;
    if (!row) await addLedger(env.DB, key, day, 0, 0, ts);
    const claimed = await env.DB
      .prepare(`UPDATE spend_ledger SET ${l.column} = ? WHERE ledger_key = ? AND day = ? AND ${l.column} IS NULL`)
      .bind(ts, key, day)
      .run();
    if (claimed.meta.changes !== 1) continue;
    if (l.column === "alert100_at") {
      // 100% supersedes 80%: never send a late 80% mail after the 100% one.
      await env.DB.prepare(`UPDATE spend_ledger SET alert80_at = ? WHERE ledger_key = ? AND day = ? AND alert80_at IS NULL`).bind(ts, key, day).run();
    }
    const who = scope === "global" ? "global" : `per-user (${key})`;
    const subject = `[SwitchQuote] ${who} spend breaker ${l.level} — ${day}`;
    const text = [
      `SwitchQuote ${who} USD breaker reached ${l.level} for ${day} (UTC).`,
      `Spent: $${(micro / MICRO).toFixed(4)} of $${limitUsd.toFixed(2)} across ${Number(row?.calls || 0)} paid calls.`,
      refused ? "A paid call was refused because it would exceed the limit." : "",
      l.level === "100%" ? (scope === "global" ? "New transcriptions and translations are paused until 00:00 UTC." : "This account is paused until 00:00 UTC.") : "",
      `Ledger key: ${key}`,
    ]
      .filter(Boolean)
      .join("\n");
    await sendAlert(env, `spend_${scope}_${l.level}`, subject, text);
    break; // one email per event
  }
}

export type PaidCall = {
  userId: string;
  email: string | null;
  kind: "stt" | "translate" | "tag";
  /** Engine id from lib/engines/registry.ts for STT; "translate" / "langtag" for the text passes. */
  engine: string;
  provider: string;
  model: string;
  ref: string;
  audioSeconds: number | null;
  estimateUsd: number;
};

/** Count a paid call at submission. Returns the event id for settle(). */
export async function recordSubmission(env: AppEnv, call: PaidCall, now = nowSeconds()): Promise<string> {
  const c = readConfig(env);
  const day = utcDay(now);
  const id = generateId();
  const micro = toMicro(call.estimateUsd);
  await env.DB
    .prepare(
      `INSERT INTO spend_events (id, day, user_id, user_email, kind, engine, provider, model, ref, audio_seconds, micro_usd, cost_source, namespace, status, http_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'estimate', ?, 'submitted', NULL, ?)`
    )
    .bind(id, day, call.userId, call.email, call.kind, call.engine, call.provider, call.model, call.ref, call.audioSeconds, micro, c.spendNamespace, now)
    .run();
  await addLedger(env.DB, globalKey(c.spendNamespace), day, micro, 1, now);
  await addLedger(env.DB, userKey(c.spendNamespace, call.userId), day, micro, 1, now);
  return id;
}

/** Settle a submitted call with the provider's answer; adjusts ledgers by the difference and sends alerts. */
export async function settle(
  env: AppEnv,
  eventId: string,
  result: { status: "ok" | "failed"; httpStatus: number | null; actualUsd: number | null; costSource: string; audioSeconds?: number | null; model?: string | null },
  now = nowSeconds()
) {
  const c = readConfig(env);
  const ev = await env.DB.prepare(`SELECT day, user_id, micro_usd FROM spend_events WHERE id = ?`).bind(eventId).first<{ day: string; user_id: string; micro_usd: number }>();
  if (!ev) return;
  const micro = result.actualUsd === null ? Number(ev.micro_usd) : toMicro(result.actualUsd);
  const delta = micro - Number(ev.micro_usd);
  await env.DB
    .prepare(`UPDATE spend_events SET status = ?, http_status = ?, micro_usd = ?, cost_source = ?, audio_seconds = COALESCE(?, audio_seconds), model = COALESCE(?, model) WHERE id = ?`)
    .bind(result.status, result.httpStatus, micro, result.actualUsd === null ? "estimate" : result.costSource, result.audioSeconds ?? null, result.model ?? null, eventId)
    .run();
  if (delta !== 0) {
    await addLedger(env.DB, globalKey(c.spendNamespace), ev.day, delta, 0, now);
    await addLedger(env.DB, userKey(c.spendNamespace, ev.user_id), ev.day, delta, 0, now);
  }
  await maybeAlert(env, globalKey(c.spendNamespace), ev.day, "global", c.dailyLimitUsd, now);
  await maybeAlert(env, userKey(c.spendNamespace, ev.user_id), ev.day, "user", c.userDailyLimitUsd, now);
}
