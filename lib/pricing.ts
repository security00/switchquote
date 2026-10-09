/** Approved 掌柜 v3 prices. Display only — Stripe Price IDs live in lib/stripe-catalog.ts. */

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    credits: 150,
    detail: "A few interviews a month.",
    monthly: { sku: "starter_monthly", usd: 12 },
    yearly: { sku: "starter_yearly", usd: 120 },
  },
  {
    id: "pro",
    name: "Pro",
    credits: 400,
    detail: "A regular bilingual beat.",
    monthly: { sku: "pro_monthly", usd: 24 },
    yearly: { sku: "pro_yearly", usd: 240 },
  },
  {
    id: "studio",
    name: "Studio",
    credits: 1000,
    detail: "A desk that transcribes every week.",
    monthly: { sku: "studio_monthly", usd: 49 },
    yearly: { sku: "studio_yearly", usd: 490 },
  },
] as const;

export const PACKS = [
  { sku: "pack_s", name: "S", usd: 9, credits: 60 },
  { sku: "pack_m", name: "M", usd: 24, credits: 200 },
  { sku: "pack_l", name: "L", usd: 59, credits: 600 },
] as const;

export const SKUS = [
  ...PLANS.flatMap((plan) => [plan.monthly.sku, plan.yearly.sku]),
  ...PACKS.map((pack) => pack.sku),
] as const;

export type Sku = (typeof SKUS)[number];

export function isSku(value: string): value is Sku {
  return (SKUS as readonly string[]).includes(value);
}

export function subscriptionCredits(sku: string): number | null {
  for (const plan of PLANS) {
    if (plan.monthly.sku === sku || plan.yearly.sku === sku) return plan.credits;
  }
  return null;
}

export function subscriptionInterval(sku: string): "month" | "year" | null {
  for (const plan of PLANS) {
    if (plan.monthly.sku === sku) return "month";
    if (plan.yearly.sku === sku) return "year";
  }
  return null;
}

export function packCredits(sku: string): number | null {
  return PACKS.find((pack) => pack.sku === sku)?.credits ?? null;
}

export function isSubscriptionSku(sku: string): boolean {
  return subscriptionCredits(sku) !== null;
}

export function isPackSku(sku: string): boolean {
  return packCredits(sku) !== null;
}
