import type { AppEnv } from "./cf";
import { isSku, type Sku } from "./pricing";

/**
 * Test-mode Price IDs from the approved catalog (acct_1TTNr52eJNPpLqRe, livemode=false).
 * Env vars override these. Lookup keys are stable if a Price ID is rotated in the Dashboard.
 */
const PRICES: Record<Sku, { env: keyof AppEnv; id: string; lookupKey: string }> = {
  starter_monthly: { env: "STRIPE_PRICE_STARTER_MONTHLY", id: "price_1UOb1e2eJNPpLqRezNIp4zdd", lookupKey: "switchquote_starter_monthly" },
  starter_yearly: { env: "STRIPE_PRICE_STARTER_YEARLY", id: "price_1UOb1e2eJNPpLqReb17osn9I", lookupKey: "switchquote_starter_yearly" },
  pro_monthly: { env: "STRIPE_PRICE_PRO_MONTHLY", id: "price_1UOb1f2eJNPpLqRe1qA1VYtu", lookupKey: "switchquote_pro_monthly" },
  pro_yearly: { env: "STRIPE_PRICE_PRO_YEARLY", id: "price_1UOb1g2eJNPpLqRequjXWPNi", lookupKey: "switchquote_pro_yearly" },
  studio_monthly: { env: "STRIPE_PRICE_STUDIO_MONTHLY", id: "price_1UOb1h2eJNPpLqRechOUH6QW", lookupKey: "switchquote_studio_monthly" },
  studio_yearly: { env: "STRIPE_PRICE_STUDIO_YEARLY", id: "price_1UOb1h2eJNPpLqReuoZeki02", lookupKey: "switchquote_studio_yearly" },
  pack_s: { env: "STRIPE_PRICE_PACK_S", id: "price_1UOb1i2eJNPpLqRedv4IAomN", lookupKey: "switchquote_pack_s" },
  pack_m: { env: "STRIPE_PRICE_PACK_M", id: "price_1UOb1i2eJNPpLqRer9JWXPsw", lookupKey: "switchquote_pack_m" },
  pack_l: { env: "STRIPE_PRICE_PACK_L", id: "price_1UOb1k2eJNPpLqRex9gwG2ty", lookupKey: "switchquote_pack_l" },
};

export function priceIdForSku(env: Partial<AppEnv>, sku: Sku): string {
  const row = PRICES[sku];
  const override = String(env[row.env] ?? "").trim();
  return override || row.id;
}

export function lookupKeyForSku(sku: Sku): string {
  return PRICES[sku].lookupKey;
}

export function resolveSku(env: Partial<AppEnv>, hints: { sku?: string | null; priceId?: string | null; lookupKey?: string | null }): Sku | null {
  const priceId = hints.priceId?.trim();
  if (priceId) {
    for (const sku of Object.keys(PRICES) as Sku[]) {
      if (priceIdForSku(env, sku) === priceId) return sku;
    }
  }
  const lookupKey = hints.lookupKey?.trim();
  if (lookupKey) {
    for (const sku of Object.keys(PRICES) as Sku[]) {
      if (PRICES[sku].lookupKey === lookupKey) return sku;
    }
  }
  const sku = hints.sku?.trim();
  if (sku && isSku(sku)) return sku;
  return null;
}
