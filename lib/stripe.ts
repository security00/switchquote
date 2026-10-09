import Stripe from "stripe";
import type { AppEnv } from "./cf";
import { nowSeconds } from "./cf";
import { readConfig } from "./config";
import { UNITS_PER_CREDIT, packExpiresAt } from "./credit-units";
import {
  ensureSubscriptionGrants,
  grantPack,
  isTerminalSubscriptionStatus,
  rememberCustomer,
  saveSubscription,
  stopSubscriptionGrants,
  userExists,
  type SubscriptionRecord,
} from "./credits";
import { isPackSku, isSubscriptionSku, packCredits, subscriptionCredits, subscriptionInterval, type Sku } from "./pricing";
import { priceIdForSku, resolveSku } from "./stripe-catalog";

const API_VERSION = "2026-09-30.endive";
const GRANT_REASONS = new Set(["subscription_create", "subscription_cycle", "subscription"]);

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: API_VERSION,
    typescript: true,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function randomLetters(n: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function createCheckoutSession(
  env: AppEnv,
  input: { userId: string; email: string; sku: Sku; origin: string; customerId: string | null }
): Promise<string> {
  const secret = readConfig(env).stripeSecretKey;
  if (!secret) throw new Error("Stripe is not configured");
  const stripe = stripeClient(secret);
  const price = priceIdForSku(env, input.sku);
  const mode = isSubscriptionSku(input.sku) ? "subscription" : "payment";
  const metadata = { user_id: input.userId, sku: input.sku };
  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price, quantity: 1 }],
    success_url: `${input.origin}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/pricing?checkout=cancel`,
    client_reference_id: input.userId,
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    metadata,
    automatic_tax: { enabled: false },
    integration_identifier: `switchquote_${randomLetters(8)}`,
    ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
  });
  if (!session.url) throw new Error("Checkout Session did not return a URL");
  return session.url;
}

type StripeApi = {
  subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> };
  checkout: { sessions: { listLineItems(id: string, params?: Stripe.Checkout.SessionListLineItemsParams): Promise<Stripe.ApiList<Stripe.LineItem>> } };
};

function sessionUser(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.user_id?.trim() || session.client_reference_id?.trim() || null;
}

async function priceHints(stripe: StripeApi, session: Stripe.Checkout.Session): Promise<{ priceId: string | null; lookupKey: string | null }> {
  try {
    const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
    const price = lines.data[0]?.price ?? null;
    if (!price) return { priceId: null, lookupKey: null };
    return { priceId: price.id, lookupKey: price.lookup_key ?? null };
  } catch (e) {
    console.error("[stripe] line items", session.id, e instanceof Error ? e.message : e);
    return { priceId: null, lookupKey: null };
  }
}

function subscriptionRecord(env: AppEnv, sub: Stripe.Subscription, fallback: { userId: string | null; sku: Sku | null }, enableGrants: boolean): SubscriptionRecord | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const priceId = price?.id ?? null;
  const sku = resolveSku(env, { priceId, lookupKey: price?.lookup_key, sku: sub.metadata?.sku || fallback.sku });
  const userId = sub.metadata?.user_id?.trim() || fallback.userId;
  const recurringInterval = price?.recurring?.interval;
  const fromPrice = recurringInterval === "month" ? "month" : recurringInterval === "year" ? "year" : null;
  const interval = fromPrice ?? (sku ? subscriptionInterval(sku) : null);
  const credits = sku ? subscriptionCredits(sku) : null;
  if (!sku || !userId || !isSubscriptionSku(sku) || !interval || !credits || !priceId) return null;
  return {
    id: sub.id,
    userId,
    sku,
    priceId,
    status: sub.status,
    interval,
    creditsPerMonth: credits,
    periodStart: item?.current_period_start ?? null,
    periodEnd: item?.current_period_end ?? null,
    enableGrants,
  };
}

async function fulfillCheckout(env: AppEnv, stripe: StripeApi, session: Stripe.Checkout.Session): Promise<void> {
  const userId = sessionUser(session);
  const hints = session.mode === "payment" ? await priceHints(stripe, session) : { priceId: null, lookupKey: null };
  const sku = resolveSku(env, { sku: session.metadata?.sku, ...hints });
  const customerId = idOf(session.customer);
  if (userId && customerId && (await userExists(env.DB, userId))) await rememberCustomer(env.DB, userId, customerId);

  const paid = session.payment_status === "paid";
  if (session.mode === "payment") {
    if (!paid || !userId || !sku || !isPackSku(sku)) {
      if (paid) console.error("[stripe] pack not credited", session.id, userId, sku);
      return;
    }
    if (!(await userExists(env.DB, userId))) {
      console.error("[stripe] pack user missing", session.id, userId);
      return;
    }
    const credits = packCredits(sku);
    if (!credits) return;
    const now = nowSeconds();
    await grantPack(env.DB, userId, sku, credits * UNITS_PER_CREDIT, `pack:${session.id}`, packExpiresAt(now), now);
    return;
  }

  if (session.mode !== "subscription") return;
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return;
  let remote: Stripe.Subscription;
  try {
    remote = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (e) {
    console.error("[stripe] subscription retrieve", subscriptionId, e instanceof Error ? e.message : e);
    throw e;
  }
  const record = subscriptionRecord(env, remote, { userId, sku: sku && isSubscriptionSku(sku) ? sku : null }, paid);
  if (!record) {
    console.error("[stripe] subscription not linked", session.id, subscriptionId);
    return;
  }
  if (!(await userExists(env.DB, record.userId))) {
    console.error("[stripe] subscription user missing", record.userId);
    return;
  }
  if (customerId) await rememberCustomer(env.DB, record.userId, customerId);
  if (isTerminalSubscriptionStatus(record.status)) {
    await stopSubscriptionGrants(env.DB, record.id, record.status);
    return;
  }
  await saveSubscription(env.DB, record);
  if (paid) await ensureSubscriptionGrants(env.DB, record.userId);
}

async function fulfillInvoice(env: AppEnv, stripe: StripeApi, invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.billing_reason || !GRANT_REASONS.has(invoice.billing_reason)) return;
  const details = invoice.parent?.subscription_details;
  let subscriptionId = idOf(details?.subscription);
  const line = invoice.lines?.data?.find((item) => item.parent?.subscription_item_details?.proration !== true) ?? invoice.lines?.data?.[0];
  if (!subscriptionId) subscriptionId = idOf(line?.subscription) || line?.parent?.subscription_item_details?.subscription || null;
  const price = line?.pricing?.price_details?.price;
  const priceId = idOf(price);
  let periodStart = line?.period?.start ?? null;
  let periodEnd = line?.period?.end ?? null;
  let remote: Stripe.Subscription | null = null;
  if (subscriptionId && (periodStart == null || periodEnd == null)) {
    try {
      remote = await stripe.subscriptions.retrieve(subscriptionId);
      const item = remote.items?.data?.[0];
      periodStart = periodStart ?? item?.current_period_start ?? null;
      periodEnd = periodEnd ?? item?.current_period_end ?? null;
    } catch (e) {
      console.error("[stripe] invoice subscription", subscriptionId, e instanceof Error ? e.message : e);
    }
  }
  const metadata = details?.metadata ?? remote?.metadata ?? {};
  let sku = resolveSku(env, { sku: metadata.sku, priceId, lookupKey: remote?.items?.data?.[0]?.price?.lookup_key });
  let userId = metadata.user_id?.trim() || null;
  if (subscriptionId && (!userId || !sku)) {
    const stored = await env.DB.prepare(`SELECT user_id, sku FROM subscriptions WHERE id = ?`).bind(subscriptionId).first<{ user_id: string; sku: string }>();
    userId = userId || stored?.user_id || null;
    sku = sku || (stored?.sku ? resolveSku(env, { sku: stored.sku }) : null);
  }
  if (!subscriptionId || !userId || !sku || !isSubscriptionSku(sku)) {
    const known = Boolean(priceId && resolveSku(env, { priceId }));
    if (subscriptionId && (known || metadata.sku)) throw new Error(`invoice ${invoice.id} is not linked to an account yet`);
    console.error("[stripe] invoice.paid not linked", invoice.id, subscriptionId, userId, sku);
    return;
  }
  if (!(await userExists(env.DB, userId))) {
    console.error("[stripe] invoice user missing", userId);
    return;
  }
  const credits = subscriptionCredits(sku);
  const interval = subscriptionInterval(sku);
  if (!credits || !interval) return;
  await saveSubscription(env.DB, {
    id: subscriptionId,
    userId,
    sku,
    priceId: priceId || priceIdForSku(env, sku),
    status: "active",
    interval,
    creditsPerMonth: credits,
    periodStart,
    periodEnd,
    enableGrants: true,
  });
  await ensureSubscriptionGrants(env.DB, userId);
}

async function syncSubscription(env: AppEnv, sub: Stripe.Subscription): Promise<void> {
  if (isTerminalSubscriptionStatus(sub.status) || sub.status === "canceled") {
    await stopSubscriptionGrants(env.DB, sub.id, sub.status);
    return;
  }
  const record = subscriptionRecord(env, sub, { userId: null, sku: null }, false);
  if (!record) return;
  if (!(await userExists(env.DB, record.userId))) return;
  await saveSubscription(env.DB, record);
}

export async function handleStripeEvent(env: AppEnv, event: Stripe.Event, stripe: StripeApi): Promise<{ duplicate: boolean }> {
  if (event.livemode) {
    console.error("[stripe] ignored livemode event", event.id, event.type);
    return { duplicate: false };
  }
  const seen = await env.DB.prepare(`SELECT id FROM stripe_events WHERE id = ?`).bind(event.id).first();
  if (seen) return { duplicate: true };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillCheckout(env, stripe, event.data.object);
      break;
    case "invoice.paid":
      await fulfillInvoice(env, stripe, event.data.object);
      break;
    case "customer.subscription.deleted":
      await stopSubscriptionGrants(env.DB, event.data.object.id, event.data.object.status || "canceled");
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(env, event.data.object);
      break;
    default:
      break;
  }

  await env.DB.prepare(`INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)`).bind(event.id, event.type, nowSeconds()).run();
  return { duplicate: false };
}
