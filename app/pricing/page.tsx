import type { Metadata } from "next";
import { PricingBoard } from "@/components/PricingBoard";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Monthly plans and credit packs for SwitchQuote interview transcription.",
};

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string | string[] }> }) {
  const query = await searchParams;
  const checkout = Array.isArray(query.checkout) ? query.checkout[0] : query.checkout;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">Private test</p>
      <h1 className="mt-2 text-[36px] leading-tight sm:text-[48px]">Credits for interview transcription</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
        One credit is about one minute of audio on the default engine. Subscriptions add a monthly allotment. A yearly plan is billed once a year and still adds that allotment each month, not as a lump. Packs are a one-time purchase and last 24 months.
      </p>
      <PricingBoard canceled={checkout === "cancel"} />
    </section>
  );
}
