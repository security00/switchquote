import Link from "next/link";
import { SampleWall } from "@/components/SampleWall";
import { TrackedLink } from "@/components/TrackedLink";
import { TranscribeApp } from "@/components/TranscribeApp";
import { PACKS, PLANS } from "@/lib/pricing";
import { hourlyFromCredits, roundUsd } from "@/lib/rate-card";
import { site } from "@/lib/site";

const steps = [
  { n: "01", title: "Upload the interview", body: "Sign in with Google. No credit card, and no anonymous upload. You get both languages as spoken, with speakers and timecodes." },
  { n: "02", title: "Review every switch", body: "Each word carries an ES or EN chip. The first word after a language change is marked Review suggested, with a count and next/previous jump." },
  { n: "03", title: "Edit, rename, and note", body: "Click a word to correct it. Rename a speaker once — including P01 / P02 — and add a fact-check note beside the English line." },
  { n: "04", title: "Export the quote", body: "DOCX, TXT, SRT, VTT, CSV, and NVivo rows keep the speaker name, language tags, and review notes." },
];

const uses = [
  { title: "Journalists & copy desks", body: "Keep the Spanish phrase and the English the source switched into, then copy a quote with the name and the timecode.", href: "/for-journalists" },
  { title: "Qualitative researchers", body: "Rename speakers to P01 and P02, export tab-separated NVivo rows, and keep a review note on the turn you still need to check.", href: "/spanglish-transcription" },
  { title: "Bilingual producers", body: "Play the file from a word, scan the low-confidence marks, and export SRT or VTT without flattening the mix into one language.", href: "/how-it-works" },
];

const faqs = [
  { q: "Do I need a credit card?", a: "No. The signup grant is 20 free credits, about 20 minutes, and it does not ask for a card. Google sign-in is required. SwitchQuote does not transcribe anonymously." },
  { q: "What is a credit?", a: "One credit is about one minute of audio on the default engine. Pack credits stay on the account for 24 months." },
  { q: "Do you publish an accuracy percentage?", a: "No. Transcripts are AI drafts. Language switches are marked Review suggested so a person can check the quote before it is published." },
];

export default function HomePage() {
  const packL = PACKS[2];
  return (
    <>
      <section className="border-b border-rule bg-[linear-gradient(180deg,var(--surface)_0%,var(--paper)_100%)]">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
          <TranscribeApp
            variant="hero"
            src="hero"
            introTop={
              <>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brass">Bilingual interview desk</p>
                <h1 className="mt-3 max-w-xl text-[36px] leading-[1.05] sm:text-[52px]">Quote the switch. Keep both languages.</h1>
                <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-soft">
                  {site.name} is a transcript desk for Spanish–English interviews. It does not turn the interview into meeting notes, and it does not replace the original words with an English translation.
                </p>
                <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-ink">No credit card required. 20 free credits ≈ 20 minutes. Google sign-in. No anonymous transcription.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <TrackedLink href="/app" src="hero" className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong">
                    Transcribe an interview
                  </TrackedLink>
                  <TrackedLink href="/pricing" src="hero" className="rounded-md border border-rule-strong bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-ink/30">
                    See pricing
                  </TrackedLink>
                </div>
              </>
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="sample-wall">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brass">Sample wall</p>
        <h2 id="sample-wall" className="mt-2 max-w-2xl text-3xl sm:text-4xl">Hear the source on the left. Read the switch on the right.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">The sample is a fictional illustration you can edit in the browser. Nothing on this wall is a customer story.</p>
        <div className="mt-8">
          <SampleWall />
        </div>
      </section>

      <section className="border-y border-rule bg-surface" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how" className="text-3xl sm:text-4xl">How it works</h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step.n} className="bg-surface p-5">
                <p className="font-mono text-xs font-medium text-brass">{step.n}</p>
                <h3 className="mt-2 font-display text-xl text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="uses">
        <h2 id="uses" className="text-3xl sm:text-4xl">Who it is for</h2>
        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {uses.map((card) => (
            <li key={card.title}>
              <Link href={card.href} className="block h-full rounded-xl border border-rule bg-surface p-6 transition-colors hover:border-brass/60">
                <h3 className="font-display text-2xl text-ink">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{card.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-rule bg-surface" aria-labelledby="prices">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="prices" className="text-3xl sm:text-4xl">Pricing, without a card to start</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Starter is ${PLANS[0].monthly.usd}/month for {PLANS[0].credits} credits. Pack {packL.name} is ${packL.usd} for {packL.credits} credits — about ${roundUsd(hourlyFromCredits(packL.usd, packL.credits)).toFixed(2)} per hour — and unused pack credits last 24 months.
          </p>
          <TrackedLink href="/pricing" src="home-pricing" className="mt-6 inline-flex font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
            Open the per-hour comparison →
          </TrackedLink>
          <div className="mt-10 max-w-2xl space-y-3">
            <h3 className="font-display text-2xl">FAQ</h3>
            {faqs.map((item) => (
              <details key={item.q} className="rounded-lg border border-rule bg-paper px-4 py-3">
                <summary className="cursor-pointer font-medium text-ink">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink bg-ink px-6 py-10 text-white sm:px-10">
          <h2 className="font-display text-3xl text-white sm:text-4xl">Bring the interview. Leave with a quote you can check.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">No credit card required. 20 free credits ≈ 20 minutes. Google sign-in. No anonymous transcription.</p>
          <TrackedLink href="/app" src="footer-cta" className="mt-6 inline-flex rounded-md bg-mark px-5 py-3 text-sm font-semibold text-ink hover:bg-white">
            Start on the desk
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
