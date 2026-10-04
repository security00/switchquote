import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "For journalists",
  description:
    "SwitchQuote for US Spanish-beat and LatAm-line reporters who need bilingual quotes on deadline.",
};

export default function ForJournalistsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl text-ink sm:text-[44px] leading-tight">
        Built for the Spanish beat—not the all-hands
      </h1>
      <p className="mt-4 text-lg text-ink-soft leading-relaxed">
        Primary ICP: journalists covering immigration, border communities, LatAm
        politics, and local Spanish-speaking sources. Secondary: Hispanic UX
        researchers running bilingual sessions.
      </p>

      <ul className="mt-10 space-y-6 text-ink leading-relaxed">
        <li>
          <strong className="text-ink">Attribution you can defend.</strong>{" "}
          Keep the Spanish clause your source used; note English switches without
          rewriting their voice.
        </li>
        <li>
          <strong className="text-ink">Deadline-friendly skimming.</strong>{" "}
          Scan for quotation-ready lines instead of wading through meeting
          summaries and filler.
        </li>
        <li>
          <strong className="text-ink">Field + remote.</strong> Long
          interviews, overlapping speech, and code switching are the norm—not
          edge cases.
        </li>
        <li>
          <strong className="text-ink">Not a replacement for ethics.</strong>{" "}
          You still verify quotes with sources; we reduce transcription drag.
        </li>
      </ul>

      <p className="mt-10 text-sm text-ink-faint">
        {site.phrases.transcribe} · {site.phrases.quoteReady}
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          href="/#waitlist"
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Join waitlist
        </Link>
        <Link
          href="/transcribe-spanish-english-interview"
          className="text-sm font-medium text-accent hover:text-accent-strong self-center"
        >
          Spanish–English interview workflow →
        </Link>
      </div>
    </div>
  );
}
