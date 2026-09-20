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
      <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
        Transcribe ≠ translate
      </h1>
      <p className="mt-4 text-lg text-slate-600 leading-relaxed">
        Translation picks a target language and rewrites meaning. Transcription
        preserves what was said—in each language—so you can attribute quotes
        accurately.
      </p>

      <div className="mt-10 space-y-8 text-slate-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-slate-900">
            1. Record the interview
          </h2>
          <p className="mt-2">
            Phone, Zoom, or field recorder—SwitchQuote is built for long-form
            source conversations, not calendar bots joining your stand-up.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-slate-900">
            2. Speaker-aware bilingual pass
          </h2>
          <p className="mt-2">
            We optimize for Spanish–English code switching: who spoke, when they
            switched, and which phrases belong in quotation marks—not a single
            English paraphrase.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-slate-900">
            3. Quote-ready export
          </h2>
          <p className="mt-2">
            Output you can skim for pull quotes, fact-check with your source, and
            paste into your CMS—with clear boundaries between Spanish and
            English lines.
          </p>
        </section>
      </div>

      <div className="mt-12 rounded-xl border border-teal-200 bg-teal-50/50 p-6">
        <p className="font-medium text-slate-900">{site.phrases.notMeetingNotes}</p>
        <p className="mt-2 text-sm text-slate-600">
          No auto-translate to English-only. No “summary of key decisions.”
          Phase A is waitlist + samples; upload comes next.
        </p>
      </div>

      <Link
        href="/#waitlist"
        className="mt-8 inline-flex font-medium text-teal-800 hover:text-teal-900"
      >
        Join the waitlist →
      </Link>
    </div>
  );
}
