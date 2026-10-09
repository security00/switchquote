/** 1 credit ≈ 1 minute of default-engine audio at 1×. Ledger math uses whole seconds. */
export const UNITS_PER_CREDIT = 60;

export const billableUnits = (durationSec: number) => Math.max(1, Math.ceil(durationSec));

export function creditsFromUnits(units: number): number {
  return Math.round((units / UNITS_PER_CREDIT) * 100) / 100;
}

export function formatCreditAmount(credits: number): string {
  const rounded = Math.round(credits * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "");
}

/** UTC calendar months from `startUnix` through `endUnix`, inclusive, capped at 36. */
export function utcMonthsFromTo(startUnix: number, endUnix: number): string[] {
  const start = new Date(startUnix * 1000);
  const end = new Date(endUnix * 1000);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
  const out: string[] = [];
  while (y * 12 + m <= endIndex && out.length < 36) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export function utcMonth(unix: number): string {
  return utcMonthsFromTo(unix, unix)[0] ?? "";
}

/** Add calendar months in UTC, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonthsUtc(unix: number, months: number): number {
  const d = new Date(unix * 1000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return Math.floor(d.getTime() / 1000);
}

export const PACK_VALID_MONTHS = 24;

export function packExpiresAt(purchasedAt: number): number {
  return addMonthsUtc(purchasedAt, PACK_VALID_MONTHS);
}
