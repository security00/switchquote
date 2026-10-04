import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "SwitchQuote transcribes bilingual interviews—it does not translate them into a single language.",
};

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl text-ink sm:text-[44px] leading-tight">
        Transcribe ≠ translate
      </h1>
      <p className="mt-4 text-lg text-ink-soft leading-relaxed">
        Translation picks a target language and rewrites meaning. Transcription
        preserves what was said—in each language—so you can attribute quotes
        accurately.
      </p>

      <div className="mt-10 space-y-8 text-ink leading-relaxed">
        <section>
          <h2 className="text-2xl text-ink">
            1. Record the interview
          </h2>
          <p className="mt-2">
            Phone, Zoom, or field recorder—SwitchQuote is built for long-form
            source conversations, not calendar bots joining your stand-up.
          </p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">
            2. Speaker-aware bilingual pass
          </h2>
          <p className="mt-2">
            We optimize for Spanish–English code switching: who spoke, when they
            switched, and which phrases belong in quotation marks—not a single
            English paraphrase.
          </p>
        </section>
        <section>
          <h2 className="text-2xl text-ink">
            3. Quote-ready export
          </h2>
          <p className="mt-2">
            Output you can skim for pull quotes, fact-check with your source, and
            paste into your CMS—with clear boundaries between Spanish and
            English lines.
          </p>
        </section>
      </div>

      <div className="mt-12 rounded-xl border border-accent/30 bg-accent/50 p-6">
        <p className="font-medium text-ink">{site.phrases.notMeetingNotes}</p>
        <p className="mt-2 text-sm text-ink-soft">
          No auto-translate to English-only. No “summary of key decisions.”
          Transcription is in a private test; everyone else can join the waitlist.
        </p>
      </div>

      <Link
        href="/#waitlist"
        className="mt-8 inline-flex font-medium text-accent hover:text-accent-strong"
      >
        Join the waitlist →
      </Link>
    </div>
  );
}
