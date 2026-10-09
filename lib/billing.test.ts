import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import type Stripe from "stripe";
import type { AppEnv } from "./cf";
import { UNITS_PER_CREDIT, addMonthsUtc, creditsFromUnits, formatCreditAmount, packExpiresAt, utcMonth } from "./credit-units";
import { availableUnits, balanceUnits, chargeCredits, dueSubscriptionMonths, ensureSignupGrant, ensureSubscriptionGrants, grantPack, lotsFromRows, planCharge, refundCredits, saveSubscription, type LotView } from "./credits";
import { handleStripeEvent } from "./stripe";
import { priceIdForSku, resolveSku } from "./stripe-catalog";

type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };

function openDb(sqlFiles: string[]): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of sqlFiles) sqlite.exec(readFileSync(path.join(process.cwd(), file), "utf8"));
  const prepare = (sql: string) => {
    const bound = (params: unknown[]) => ({
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...params) as T[] };
      },
    });
    return { ...bound([]), bind: (...params: unknown[]) => bound(params) };
  };
  return {
    prepare,
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

const schema = ["migrations/0002_transcription_mvp.sql", "migrations/0004_credit_ledger.sql"];
const JAN15 = Math.floor(Date.UTC(2026, 0, 15) / 1000);
const OCT9 = Math.floor(Date.UTC(2026, 9, 9, 12) / 1000);
const NEXT_JAN = Math.floor(Date.UTC(2027, 0, 15) / 1000);

function lot(partial: LotView): LotView {
  return partial;
}

async function seedUser(db: D1Database, id = "user_1", email = "xiangqiling5204@gmail.com") {
  await db.prepare(`INSERT INTO users (id, email, name, image, google_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, 1, 1)`).bind(id, email, `g_${id}`).run();
}

test("charges spend the signup grant, then subscription credits, then the soonest pack", () => {
  const now = 1_000_000;
  const lots = [
    lot({ id: "pack-late", pool: "pack", remaining: 100, expiresAt: now + 5_000, createdAt: 3 }),
    lot({ id: "sub", pool: "subscription", remaining: 40, expiresAt: null, createdAt: 2 }),
    lot({ id: "grant", pool: "grant", remaining: 30, expiresAt: null, createdAt: 1 }),
    lot({ id: "pack-soon", pool: "pack", remaining: 50, expiresAt: now + 100, createdAt: 4 }),
    lot({ id: "pack-dead", pool: "pack", remaining: 999, expiresAt: now - 1, createdAt: 0 }),
  ];
  const plan = planCharge(lots, 100, now);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(
    plan.takes.map((take) => [take.lotId, take.units]),
    [
      ["grant", 30],
      ["sub", 40],
      ["pack-soon", 30],
    ]
  );
  assert.equal(availableUnits(lots, now), 30 + 40 + 50 + 100);
});

test("a short balance is refused without a partial plan", () => {
  const plan = planCharge([lot({ id: "grant", pool: "grant", remaining: 10, expiresAt: null, createdAt: 1 })], 11, 1);
  assert.deepEqual(plan, { ok: false, shortfall: 1 });
});

test("yearly subscriptions mint one month at a time inside the paid period", () => {
  const yearly = { id: "sub_year", status: "active", interval: "year" as const, creditsPerMonth: 150, periodStart: JAN15, periodEnd: NEXT_JAN, grantsEnabled: true };
  assert.deepEqual(dueSubscriptionMonths(yearly, OCT9), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(dueSubscriptionMonths({ ...yearly, interval: "month" }, OCT9), ["2026-01"]);
  assert.deepEqual(dueSubscriptionMonths({ ...yearly, grantsEnabled: false }, OCT9), []);
  assert.deepEqual(dueSubscriptionMonths({ ...yearly, status: "past_due" }, OCT9), []);
  assert.deepEqual(dueSubscriptionMonths(yearly, JAN15 - 1), []);
  assert.deepEqual(dueSubscriptionMonths(yearly, NEXT_JAN), []);
});

test("price ids and lookup keys map to the approved credit amounts", () => {
  assert.equal(priceIdForSku({}, "starter_monthly"), "price_1UOb1e2eJNPpLqRezNIp4zdd");
  assert.equal(priceIdForSku({}, "studio_yearly"), "price_1UOb1h2eJNPpLqReuoZeki02");
  assert.equal(priceIdForSku({}, "pack_l"), "price_1UOb1k2eJNPpLqRex9gwG2ty");
  assert.equal(resolveSku({}, { priceId: "price_1UOb1f2eJNPpLqRe1qA1VYtu" }), "pro_monthly");
  assert.equal(resolveSku({ STRIPE_PRICE_PRO_MONTHLY: "price_override" }, { priceId: "price_override" }), "pro_monthly");
  assert.equal(resolveSku({}, { priceId: "price_1UOb1e2eJNPpLqRezNIp4zdd" }), "starter_monthly");
  assert.equal(resolveSku({ STRIPE_PRICE_STARTER_MONTHLY: "price_override" }, { priceId: "price_1UOb1e2eJNPpLqRezNIp4zdd", lookupKey: "switchquote_starter_monthly" }), "starter_monthly");
  assert.equal(resolveSku({}, { lookupKey: "switchquote_pack_m" }), "pack_m");
  assert.equal(resolveSku({}, { sku: "studio_yearly" }), "studio_yearly");
  assert.equal(resolveSku({}, { sku: "not_a_sku", priceId: "price_unknown" }), null);
  assert.equal(creditsFromUnits(150 * UNITS_PER_CREDIT), 150);
  assert.equal(formatCreditAmount(1.5), "1.5");
  assert.equal(utcMonth(JAN15), "2026-01");
  assert.equal(packExpiresAt(JAN15), addMonthsUtc(JAN15, 24));
  assert.equal(new Date(packExpiresAt(JAN15) * 1000).toISOString().slice(0, 10), "2028-01-15");
});

test("signup grant, spend order, refund, and pack expiry are idempotent in the ledger", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const env = { DB: db, SIGNUP_FREE_CREDITS: "20", TRANSCRIBE_ALLOWLIST: "" } as AppEnv;
  assert.equal(await ensureSignupGrant(env, "user_1"), true);
  assert.equal(await ensureSignupGrant(env, "user_1"), false);
  assert.equal(await balanceUnits(db, "user_1", OCT9), 20 * UNITS_PER_CREDIT);

  const blocked = { DB: db, SIGNUP_FREE_CREDITS: "20", TRANSCRIBE_ALLOWLIST: "xiangqiling5204@gmail.com" } as AppEnv;
  await seedUser(db, "user_2", "other@example.com");
  assert.equal(await ensureSignupGrant(blocked, "user_2"), false);
  assert.equal(await balanceUnits(db, "user_2", OCT9), 0);

  await db.prepare(`INSERT INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at) VALUES ('sub_lot', 'user_1', 'subscription', 'subscription', ?, 'sub:sub_x:2026-10', NULL, 'pro_monthly', NULL, 2)`).bind(400 * UNITS_PER_CREDIT).run();
  await db.prepare(`INSERT INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at) VALUES ('pack_soon', 'user_1', 'pack', 'pack', ?, 'pack:soon', NULL, 'pack_s', ?, 3)`).bind(60 * UNITS_PER_CREDIT, OCT9 + 100).run();
  await db.prepare(`INSERT INTO credit_ledger (id, user_id, kind, pool, units, ref, lot_id, sku, expires_at, created_at) VALUES ('pack_dead', 'user_1', 'pack', 'pack', ?, 'pack:dead', NULL, 'pack_m', ?, 4)`).bind(200 * UNITS_PER_CREDIT, OCT9 - 10).run();

  const first = await chargeCredits(db, "user_1", 20 * UNITS_PER_CREDIT + 30, "t1", OCT9);
  assert.equal(first.ok, true);
  const charges = await db.prepare(`SELECT pool, units FROM credit_ledger WHERE kind = 'charge' AND ref LIKE 'charge:t1:%' ORDER BY units`).all<{ pool: string; units: number }>();
  assert.deepEqual(charges.results.map((row) => [row.pool, row.units]), [
    ["grant", -(20 * UNITS_PER_CREDIT)],
    ["subscription", -30],
  ]);
  assert.equal(await chargeCredits(db, "user_1", 99999, "t1", OCT9).then((res) => res.ok), true);
  const chargeCount = await db.prepare(`SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'charge' AND ref LIKE 'charge:t1:%'`).first<{ n: number }>();
  assert.equal(Number(chargeCount?.n), 2);

  await refundCredits(db, "user_1", 20 * UNITS_PER_CREDIT + 30, "t1", OCT9);
  await refundCredits(db, "user_1", 20 * UNITS_PER_CREDIT + 30, "t1", OCT9);
  assert.equal(await balanceUnits(db, "user_1", OCT9), (20 + 400 + 60) * UNITS_PER_CREDIT);

  const again = await chargeCredits(db, "user_1", 20 * UNITS_PER_CREDIT + 10, "t2", OCT9);
  assert.equal(again.ok, true);
  const second = await db.prepare(`SELECT pool, units FROM credit_ledger WHERE kind = 'charge' AND ref LIKE 'charge:t2:%'`).all<{ pool: string; units: number }>();
  assert.deepEqual(second.results.map((row) => [row.pool, Math.abs(row.units)]).sort(), [
    ["grant", 20 * UNITS_PER_CREDIT],
    ["subscription", 10],
  ]);

  const refused = await chargeCredits(db, "user_2", 1, "t3", OCT9);
  assert.equal(refused.ok, false);
});

test("minute balances migrate into the grant pool once", () => {
  const { DatabaseSync: Sync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };
  const sqlite = new Sync(":memory:");
  sqlite.exec(readFileSync("migrations/0002_transcription_mvp.sql", "utf8"));
  sqlite.prepare(`INSERT INTO users (id, email, name, image, google_id, created_at, updated_at) VALUES ('u', 'a@b.c', NULL, NULL, 'g', 1, 1)`).run();
  sqlite.prepare(`INSERT INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES ('g', 'u', 'grant', 900, NULL, 1)`).run();
  sqlite.prepare(`INSERT INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES ('c', 'u', 'charge', -120, 'audio1', 2)`).run();
  sqlite.prepare(`INSERT INTO minute_ledger (id, user_id, kind, seconds, ref, created_at) VALUES ('r', 'u', 'refund', 60, 'audio1', 3)`).run();
  sqlite.exec(readFileSync("migrations/0004_credit_ledger.sql", "utf8"));
  const rows = sqlite.prepare(`SELECT kind, pool, units, ref, lot_id FROM credit_ledger ORDER BY created_at`).all() as Array<Record<string, unknown>>;
  assert.equal(rows.length, 3);
  assert.equal(rows[1].ref, "charge:audio1");
  assert.equal(rows[1].lot_id, "g");
  assert.equal(rows[2].lot_id, "g");
  const ledger = sqlite.prepare(`SELECT id, kind, pool, units, lot_id, expires_at, created_at FROM credit_ledger`).all() as Array<Record<string, unknown>>;
  const units = availableUnits(
    lotsFromRows(
      ledger.map((row) => ({
        id: String(row.id),
        kind: String(row.kind) as "signup" | "charge" | "refund",
        pool: "grant",
        units: Number(row.units),
        lot_id: row.lot_id == null ? null : String(row.lot_id),
        expires_at: null,
        created_at: Number(row.created_at),
      }))
    ),
    OCT9
  );
  assert.equal(units, 840);
});

function stripeApi(subscription?: Stripe.Subscription, priceId = "price_1UOb1i2eJNPpLqRedv4IAomN"): Stripe {
  return {
    subscriptions: { retrieve: async () => subscription ?? ({} as Stripe.Subscription) },
    checkout: {
      sessions: {
        listLineItems: async () =>
          ({
            object: "list",
            data: [{ price: { id: priceId, lookup_key: "switchquote_pack_s" } }],
            has_more: false,
            url: "",
          }) as unknown as Stripe.ApiList<Stripe.LineItem>,
      },
    },
  } as unknown as Stripe;
}

function event(id: string, type: string, object: object, livemode = false): Stripe.Event {
  return { id, type, livemode, data: { object } } as Stripe.Event;
}

test("webhook credits a paid pack once across both checkout events", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const env = { DB: db } as AppEnv;
  const session = { id: "cs_pack", mode: "payment", payment_status: "unpaid", metadata: { user_id: "user_1", sku: "pack_s" }, client_reference_id: "user_1", customer: "cus_1", subscription: null };
  await handleStripeEvent(env, event("evt_unpaid", "checkout.session.completed", session), stripeApi());
  assert.equal(await balanceUnits(db, "user_1", OCT9), 0);

  const paid = { ...session, payment_status: "paid" };
  await handleStripeEvent(env, event("evt_paid", "checkout.session.async_payment_succeeded", paid), stripeApi());
  await handleStripeEvent(env, event("evt_paid", "checkout.session.async_payment_succeeded", paid), stripeApi());
  await handleStripeEvent(env, event("evt_paid_again", "checkout.session.completed", paid), stripeApi());
  assert.equal(await balanceUnits(db, "user_1", OCT9), 60 * UNITS_PER_CREDIT);
  const packs = await db.prepare(`SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'pack'`).first<{ n: number }>();
  assert.equal(Number(packs?.n), 1);
});

test("a paid subscription checkout and the first invoice grant the same month once", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const env = { DB: db } as AppEnv;
  const periodStart = Math.floor(Date.now() / 1000) - 86_400;
  const periodEnd = periodStart + 30 * 86_400;
  const subscription = {
    id: "sub_1",
    status: "active",
    metadata: { user_id: "user_1", sku: "starter_monthly" },
    customer: "cus_1",
    items: { data: [{ current_period_start: periodStart, current_period_end: periodEnd, price: { id: "price_1UOb1e2eJNPpLqRezNIp4zdd", lookup_key: "switchquote_starter_monthly", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription;
  const session = { id: "cs_sub", mode: "subscription", payment_status: "paid", metadata: { user_id: "user_1", sku: "starter_monthly" }, client_reference_id: "user_1", customer: "cus_1", subscription: "sub_1" };
  await handleStripeEvent(env, event("evt_cs", "checkout.session.completed", session), stripeApi(subscription));
  const invoice = {
    id: "in_1",
    billing_reason: "subscription_create",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: { user_id: "user_1", sku: "starter_monthly" } } },
    lines: { data: [{ period: { start: periodStart, end: periodEnd }, pricing: { price_details: { price: "price_1UOb1e2eJNPpLqRezNIp4zdd" } }, parent: { subscription_item_details: { proration: false, subscription: "sub_1" } }, subscription: "sub_1" }] },
  };
  await handleStripeEvent(env, event("evt_in", "invoice.paid", invoice), stripeApi(subscription));
  await handleStripeEvent(env, event("evt_in", "invoice.paid", invoice), stripeApi(subscription));
  assert.equal(await balanceUnits(db, "user_1", periodStart + 10), 150 * UNITS_PER_CREDIT);
});

test("subscription.updated does not mint credits; invoice.paid and yearly backfill do, once", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const env = { DB: db } as AppEnv;
  const subscription = {
    id: "sub_year",
    status: "active",
    metadata: { user_id: "user_1", sku: "starter_yearly" },
    customer: "cus_1",
    items: { data: [{ current_period_start: JAN15, current_period_end: NEXT_JAN, price: { id: "price_1UOb1e2eJNPpLqReb17osn9I", lookup_key: "switchquote_starter_yearly", recurring: { interval: "year" } } }] },
  } as unknown as Stripe.Subscription;
  await handleStripeEvent(env, event("evt_upd", "customer.subscription.updated", subscription), stripeApi(subscription));
  assert.equal(await balanceUnits(db, "user_1", OCT9), 0);

  const invoice = {
    id: "in_year",
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: "sub_year", metadata: { user_id: "user_1", sku: "starter_yearly" } } },
    lines: { data: [{ period: { start: JAN15, end: NEXT_JAN }, pricing: { price_details: { price: "price_1UOb1e2eJNPpLqReb17osn9I" } }, parent: { subscription_item_details: { proration: false } } }] },
  };
  await handleStripeEvent(env, event("evt_year", "invoice.paid", invoice), stripeApi(subscription));
  assert.equal(await balanceUnits(db, "user_1", OCT9), 10 * 150 * UNITS_PER_CREDIT);
  assert.equal(await ensureSubscriptionGrants(db, "user_1", OCT9), 0);

  await handleStripeEvent(env, event("evt_live", "invoice.paid", { ...invoice, livemode: true }, true), stripeApi(subscription));
  assert.equal(await balanceUnits(db, "user_1", OCT9), 10 * 150 * UNITS_PER_CREDIT);
});

test("an unpaid checkout does not enable subscription grants", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const env = { DB: db } as AppEnv;
  const start = Math.floor(Date.now() / 1000) - 3600;
  const end = start + 30 * 86_400;
  const subscription = {
    id: "sub_wait",
    status: "active",
    metadata: { user_id: "user_1", sku: "pro_monthly" },
    items: { data: [{ current_period_start: start, current_period_end: end, price: { id: "price_1UOb1f2eJNPpLqRe1qA1VYtu", lookup_key: "switchquote_pro_monthly", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription;
  const session = { id: "cs_wait", mode: "subscription", payment_status: "unpaid", metadata: { user_id: "user_1", sku: "pro_monthly" }, subscription: "sub_wait", customer: null };
  await handleStripeEvent(env, event("evt_wait", "checkout.session.completed", session), stripeApi(subscription));
  assert.equal(await balanceUnits(db, "user_1", start + 10), 0);
  await saveSubscription(db, { id: "sub_manual", userId: "user_1", sku: "pro_monthly", priceId: "price_x", status: "active", interval: "month", creditsPerMonth: 400, periodStart: start, periodEnd: end, enableGrants: false });
  assert.equal(await ensureSubscriptionGrants(db, "user_1", start + 10), 0);
});

test("grantPack is idempotent on the checkout session id", async () => {
  const db = openDb(schema);
  await seedUser(db);
  const now = OCT9;
  assert.equal(await grantPack(db, "user_1", "pack_l", 600 * UNITS_PER_CREDIT, "pack:cs_l", packExpiresAt(now), now), 1);
  assert.equal(await grantPack(db, "user_1", "pack_l", 600 * UNITS_PER_CREDIT, "pack:cs_l", packExpiresAt(now), now), 0);
  assert.equal(await balanceUnits(db, "user_1", now), 600 * UNITS_PER_CREDIT);
  assert.equal(await balanceUnits(db, "user_1", packExpiresAt(now)), 0);
});
