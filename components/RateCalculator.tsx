"use client";

import { useMemo, useState } from "react";
import { cheapestPack, hourlyFromCredits, quotePacks, roundUsd, sonixCoreMonths, sonixPaygUsd, SONIX_PUBLIC_CORE_HOURS, SONIX_PUBLIC_CORE_MONTHLY_USD, SONIX_PUBLIC_PAYG_USD_PER_HOUR } from "@/lib/rate-card";
import { PACKS } from "@/lib/pricing";

export function RateCalculator() {
  const [hours, setHours] = useState(5);
  const quotes = useMemo(() => quotePacks(hours), [hours]);
  const best = cheapestPack(hours);
  const payg = sonixPaygUsd(hours);
  const core = sonixCoreMonths(hours);

  return (
    <section className="mt-14 rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_2px_rgba(28,25,21,0.04)]" aria-labelledby="hour-cost">
      <h2 id="hour-cost" className="text-3xl">Per-hour cost</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        One SwitchQuote credit is about one minute, so a pack&apos;s hourly price is its price divided by the hours those credits cover. Pack credits stay on the account for 24 months. A monthly hour allotment is different: the public Sonix Core plan is ${SONIX_PUBLIC_CORE_MONTHLY_USD} for {SONIX_PUBLIC_CORE_HOURS} hours that month, and pay-as-you-go is ${SONIX_PUBLIC_PAYG_USD_PER_HOUR} per audio hour. Unused hours in that kind of monthly bucket do not carry the way a 24-month pack does.
      </p>
      <label className="mt-5 block text-sm font-medium text-ink">
        Hours to compare
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-2 block w-full"
        />
      </label>
      <p className="mt-2 font-mono text-sm text-ink">{hours} h</p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">SwitchQuote packs beside the public Sonix list prices</caption>
          <thead>
            <tr className="border-b border-rule text-ink-faint">
              <th className="py-2 pr-3 font-medium">Option</th>
              <th className="py-2 pr-3 font-medium">Equivalent / hour</th>
              <th className="py-2 pr-3 font-medium">To cover {hours} h</th>
              <th className="py-2 font-medium">Credits stay</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const highlight = best?.sku === quote.sku;
              return (
                <tr key={quote.sku} className={highlight ? "bg-mark/40" : undefined}>
                  <th className="py-3 pr-3 font-medium text-ink">Pack {quote.name}{highlight ? " · lower total here" : ""}</th>
                  <td className="py-3 pr-3 font-mono text-ink">${quote.hourly.toFixed(2)}</td>
                  <td className="py-3 pr-3 text-ink-soft">{quote.packsNeeded} × ${quote.usd} = ${quote.totalUsd.toFixed(2)}</td>
                  <td className="py-3 text-ink-soft">24 months</td>
                </tr>
              );
            })}
            <tr className="border-t border-rule">
              <th className="py-3 pr-3 font-medium text-ink">Sonix pay as you go (public)</th>
              <td className="py-3 pr-3 font-mono text-ink">${SONIX_PUBLIC_PAYG_USD_PER_HOUR.toFixed(2)}</td>
              <td className="py-3 pr-3 text-ink-soft">${payg.toFixed(2)} for {hours} h</td>
              <td className="py-3 text-ink-soft">Billed per audio hour</td>
            </tr>
            <tr>
              <th className="py-3 pr-3 font-medium text-ink">Sonix Core (public)</th>
              <td className="py-3 pr-3 font-mono text-ink">${(SONIX_PUBLIC_CORE_MONTHLY_USD / SONIX_PUBLIC_CORE_HOURS).toFixed(2)} if all {SONIX_PUBLIC_CORE_HOURS} h are used</td>
              <td className="py-3 pr-3 text-ink-soft">{core.months} month{core.months === 1 ? "" : "s"} × ${SONIX_PUBLIC_CORE_MONTHLY_USD} = ${core.usd.toFixed(2)} ({core.hoursIncluded} h included)</td>
              <td className="py-3 text-ink-soft">Monthly allotment</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        SwitchQuote pack rates: {PACKS.map((pack) => `${pack.name} $${pack.usd} / ${pack.credits} credits ($${roundUsd(hourlyFromCredits(pack.usd, pack.credits)).toFixed(2)}/h)`).join("; ")}. The Sonix figures are the public list prices above, not a quote from SwitchQuote and not a claim about taxes, overage, or a plan we have not opened.
      </p>
    </section>
  );
}
