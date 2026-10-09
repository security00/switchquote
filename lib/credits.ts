import type { AppEnv } from "./cf";
import { generateId, nowSeconds } from "./cf";
import { readConfig } from "./config";
import { accessForUser } from "./access";
import { UNITS_PER_CREDIT, utcMonthsFromTo } from "./credit-units";
import { isSubscriptionSku, subscriptionCredits } from "./pricing";

export type Pool = "grant" | "subscription" | "pack";
export type LotKind = "signup" | "subscription" | "pack";

const POOL_RANK: Record<Pool, number> = { grant: 0, subscription: 1, pack: 2 };

export type LedgerRow = {
  id: string;
  kind: LotKind | "charge" | "refund";
  pool: Pool;
  units: number;
  lot_id: string | null;
  expires_at: number | null;
  created_at: number;
};

export type LotView = {
  id: string;
  pool: Pool;
  remaining: number;
  expiresAt: number | null;
  createdAt: number;
};

export function lotsFromRows(rows: LedgerRow[]): LotView[] {
  const grants = rows.filter((row) => row.kind === "signup" || row.kind === "subscription" || row.kind === "pack");
  return grants.map((lot) => {
    const moved = rows.filter((row) => row.lot_id === lot.id).reduce((sum, row) => sum + row.units, 0);
    return { id: lot.id, pool: lot.pool, remaining: lot.units + moved, expiresAt: lot.expires_at, createdAt: lot.created_at };
  });
}

export function availableUnits(lots: LotView[], now: number): number {
  return lots
    .filter((lot) => lot.remaining > 0 && (lot.expiresAt == null || lot.expiresAt > now))
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

export type ChargeTake = { lotId: string; pool: Pool; units: number };

/** Spend grant, then subscription, then pack. Inside a pool, soonest expiry goes first. */
export function planCharge(lots: LotView[], units: number, now: number): { ok: true; takes: ChargeTake[] } | { ok: false; shortfall: number } {
  if (units <= 0) return { ok: true, takes: [] };
  const usable = lots
    .filter((lot) => lot.remaining > 0 && (lot.expiresAt == null || lot.expiresAt > now))
    .sort((a, b) => {
      const pool = POOL_RANK[a.pool] - POOL_RANK[b.pool];
      if (pool !== 0) return pool;
      const expiry = (a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER);
      if (expiry !== 0) return expiry;
      return a.createdAt - b.createdAt;
    });
  let left = units;
  const takes: ChargeTake[] = [];
  for (const lot of usable) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    takes.push({ lotId: lot.id, pool: lot.pool, units: take });
    left -= take;
  }
  if (left > 0) return { ok: false, shortfall: left };
  return { ok: true, takes };
}

export type SubscriptionWindow = {
  id: string;
  status: string;
  interval: "month" | "year";
  creditsPerMonth: number;
  periodStart: number | null;
  periodEnd: number | null;
  grantsEnabled: boolean;
};

/** Months of an already-paid subscription that should have credits. Yearly plans mint one month at a time. */
export function dueSubscriptionMonths(sub: SubscriptionWindow, now: number): string[] {
  if (!sub.grantsEnabled || sub.status !== "active") return [];
  if (sub.creditsPerMonth <= 0 || sub.periodStart == null || sub.periodEnd == null) return [];
  if (now < sub.periodStart || now >= sub.periodEnd) return [];
  if (sub.interval === "month") return utcMonthsFromTo(sub.periodStart, sub.periodStart);
  return utcMonthsFromTo(sub.periodStart, Math.min(now, sub.periodEnd - 1));
}

export function subscriptionGrantRef(subscriptionId: string, month: string): string {
  return `sub:${subscriptionId}:${month}`;
}

const LEDGER_COLS = `id, kind, pool, units, lot_id, expires_at, created_at`;

async function loadLedger(db: D1Database, userId: string): Promise<LedgerRow[]> {
  const rows = await db.prepare(`SELECT ${LEDGER_COLS} FROM credit_ledger WHERE user_id = ?`).bind(userId).all<LedgerRow>();
  return rows.results || [];
}

export async function balanceUnits(db: D1Database, userId: string, now = nowSeconds()): Promise<number> {
  return availableUnits(lotsFromRows(await loadLedger(db, userId)), now);
}

/**
 * One-time signup grant (SIGNUP_FREE_CREDITS). While the allowlist is active only allowed
 * accounts get it. Idempotent through the unique signup index.
 */
export async function ensureSignupGrant(env: AppEnv, userId: string): Promise<boolean> {
  const credits = readConfig(env).signupFreeCredits;
  if (credits <= 0) return false;
  if ((await accessForUser(env, userId)) === "waitlist") return false;
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
     VALUES (?, ?, 'signup', 'grant', ?, NULL, NULL, NULL, NULL, ?)`
  )
    .bind(generateId(), userId, Math.round(credits * UNITS_PER_CREDIT), nowSeconds())
    .run();
  return res.meta.changes === 1;
}

export async function grantPack(db: D1Database, userId: string, sku: string, units: number, ref: string, expiresAt: number, now = nowSeconds()): Promise<number> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
       VALUES (?, ?, 'pack', 'pack', ?, ?, NULL, ?, ?, ?)`
    )
    .bind(generateId(), userId, units, ref, sku, expiresAt, now)
    .run();
  return res.meta.changes ?? 0;
}

export type SubscriptionRecord = {
  id: string;
  userId: string;
  sku: string;
  priceId: string;
  status: string;
  interval: "month" | "year";
  creditsPerMonth: number;
  periodStart: number | null;
  periodEnd: number | null;
  enableGrants: boolean;
};

export async function saveSubscription(db: D1Database, row: SubscriptionRecord, now = nowSeconds()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscriptions (id, user_id, sku, price_id, status, interval, credits_per_month, period_start, period_end, grants_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         sku = excluded.sku,
         price_id = excluded.price_id,
         status = excluded.status,
         interval = excluded.interval,
         credits_per_month = excluded.credits_per_month,
         period_start = COALESCE(excluded.period_start, subscriptions.period_start),
         period_end = COALESCE(excluded.period_end, subscriptions.period_end),
         grants_enabled = MAX(subscriptions.grants_enabled, excluded.grants_enabled),
         updated_at = excluded.updated_at`
    )
    .bind(
      row.id,
      row.userId,
      row.sku,
      row.priceId,
      row.status,
      row.interval,
      row.creditsPerMonth,
      row.periodStart,
      row.periodEnd,
      row.enableGrants ? 1 : 0,
      now,
      now
    )
    .run();
}

const TERMINAL = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL.has(status);
}

export async function stopSubscriptionGrants(db: D1Database, id: string, status: string, now = nowSeconds()): Promise<void> {
  await db.prepare(`UPDATE subscriptions SET status = ?, grants_enabled = 0, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
}

export async function ensureSubscriptionGrants(db: D1Database, userId: string, now = nowSeconds()): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, status, interval, credits_per_month, period_start, period_end, grants_enabled, sku
       FROM subscriptions WHERE user_id = ? AND grants_enabled = 1`
    )
    .bind(userId)
    .all<{
      id: string;
      status: string;
      interval: "month" | "year";
      credits_per_month: number;
      period_start: number | null;
      period_end: number | null;
      grants_enabled: number;
      sku: string;
    }>();
  let inserted = 0;
  for (const row of rows.results || []) {
    if (!isSubscriptionSku(row.sku)) continue;
    const months = dueSubscriptionMonths(
      {
        id: row.id,
        status: row.status,
        interval: row.interval,
        creditsPerMonth: row.credits_per_month,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        grantsEnabled: row.grants_enabled === 1,
      },
      now
    );
    const credits = subscriptionCredits(row.sku) ?? row.credits_per_month;
    for (const month of months) {
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
           VALUES (?, ?, 'subscription', 'subscription', ?, ?, NULL, ?, NULL, ?)`
        )
        .bind(generateId(), userId, credits * UNITS_PER_CREDIT, subscriptionGrantRef(row.id, month), row.sku, now)
        .run();
      inserted += res.meta.changes ?? 0;
    }
  }
  return inserted;
}

export async function chargeCredits(
  db: D1Database,
  userId: string,
  units: number,
  transcriptId: string,
  now = nowSeconds()
): Promise<{ ok: true; unitsLeft: number } | { ok: false; unitsLeft: number }> {
  const prior = await db.prepare(`SELECT id FROM credit_ledger WHERE kind = 'charge' AND ref LIKE ? LIMIT 1`).bind(`charge:${transcriptId}:%`).first();
  const lots = lotsFromRows(await loadLedger(db, userId));
  const left = availableUnits(lots, now);
  if (prior) return { ok: true, unitsLeft: left };
  const plan = planCharge(lots, units, now);
  if (!plan.ok) return { ok: false, unitsLeft: left };
  if (plan.takes.length === 0) return { ok: true, unitsLeft: left };
  await db.batch(
    plan.takes.map((take) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
           VALUES (?, ?, 'charge', ?, ?, ?, ?, NULL, NULL, ?)`
        )
        .bind(generateId(), userId, take.pool, -take.units, `charge:${transcriptId}:${take.lotId}`, take.lotId, now)
    )
  );
  return { ok: true, unitsLeft: left - units };
}

export async function refundCredits(db: D1Database, userId: string, units: number, transcriptId: string, now = nowSeconds()): Promise<void> {
  const charges = await db
    .prepare(`SELECT lot_id, pool, units FROM credit_ledger WHERE user_id = ? AND kind = 'charge' AND ref LIKE ?`)
    .bind(userId, `charge:${transcriptId}:%`)
    .all<{ lot_id: string; pool: Pool; units: number }>();
  const rows = charges.results || [];
  if (rows.length === 0) return;
  const refundUnits = Math.min(
    Math.abs(units),
    rows.reduce((sum, row) => sum + Math.abs(row.units), 0)
  );
  let left = refundUnits;
  const takes: { lotId: string; pool: Pool; units: number }[] = [];
  for (const row of rows) {
    if (left <= 0) break;
    const give = Math.min(Math.abs(row.units), left);
    if (!row.lot_id || give <= 0) continue;
    takes.push({ lotId: row.lot_id, pool: row.pool, units: give });
    left -= give;
  }
  if (takes.length === 0) return;
  await db.batch(
    takes.map((take) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at)
           VALUES (?, ?, 'refund', ?, ?, ?, ?, NULL, NULL, ?)`
        )
        .bind(generateId(), userId, take.pool, take.units, `refund:${transcriptId}:${take.lotId}`, take.lotId, now)
    )
  );
}

export async function rememberCustomer(db: D1Database, userId: string, customerId: string): Promise<void> {
  await db.prepare(`UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL`).bind(customerId, userId).run();
}

export async function stripeCustomerId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT stripe_customer_id FROM users WHERE id = ?`).bind(userId).first<{ stripe_customer_id: string | null }>();
  return row?.stripe_customer_id ?? null;
}

export async function userExists(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first<{ id: string }>();
  return Boolean(row?.id);
}
