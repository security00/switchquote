import { PACKS, PLANS } from "./pricing";

/** Public Sonix list prices from sonix.ai/pricing (page dated October 2026, recorded 2026-11-23). */
export const SONIX_PUBLIC_PAYG_USD_PER_HOUR = 10;
export const SONIX_PUBLIC_CORE_MONTHLY_USD = 25;
export const SONIX_PUBLIC_CORE_HOURS = 5;

/** 1 credit ≈ 1 minute, so a pack's equivalent hourly price is usd / hours of credits. */
export function hourlyFromCredits(usd: number, credits: number): number {
  if (credits <= 0) return 0;
  return roundUsd((usd / credits) * 60);
}

export function roundUsd(usd: number): number {
  return Math.round(usd * 100) / 100;
}

export type PackQuote = {
  sku: string;
  name: string;
  usd: number;
  credits: number;
  hourly: number;
  packsNeeded: number;
  totalUsd: number;
  creditsBought: number;
};

export function quotePacks(hours: number): PackQuote[] {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const need = safeHours * 60;
  return PACKS.map((pack) => {
    const packsNeeded = need === 0 ? 0 : Math.ceil(need / pack.credits);
    return {
      sku: pack.sku,
      name: pack.name,
      usd: pack.usd,
      credits: pack.credits,
      hourly: roundUsd(hourlyFromCredits(pack.usd, pack.credits)),
      packsNeeded,
      totalUsd: roundUsd(packsNeeded * pack.usd),
      creditsBought: packsNeeded * pack.credits,
    };
  });
}

export function cheapestPack(hours: number): PackQuote | null {
  const quotes = quotePacks(hours).filter((quote) => quote.packsNeeded > 0);
  if (!quotes.length) return null;
  return quotes.reduce((best, quote) => (quote.totalUsd < best.totalUsd ? quote : best));
}

export function sonixPaygUsd(hours: number): number {
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 0;
  return roundUsd(safe * SONIX_PUBLIC_PAYG_USD_PER_HOUR);
}

/** How many public $25 / 5-hour months cover `hours` if every included hour is used. */
export function sonixCoreMonths(hours: number): { months: number; usd: number; hoursIncluded: number } {
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const months = safe === 0 ? 0 : Math.ceil(safe / SONIX_PUBLIC_CORE_HOURS);
  return { months, usd: roundUsd(months * SONIX_PUBLIC_CORE_MONTHLY_USD), hoursIncluded: months * SONIX_PUBLIC_CORE_HOURS };
}

export function planHourly(planId: (typeof PLANS)[number]["id"], yearly: boolean): number {
  const plan = PLANS.find((item) => item.id === planId);
  if (!plan) return 0;
  const choice = yearly ? plan.yearly : plan.monthly;
  const credits = yearly ? plan.credits * 12 : plan.credits;
  return roundUsd(hourlyFromCredits(choice.usd, credits));
}
