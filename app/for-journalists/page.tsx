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
      <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
        Built for the Spanish beat—not the all-hands
      </h1>
      <p className="mt-4 text-lg text-slate-600 leading-relaxed">
        Primary ICP: journalists covering immigration, border communities, LatAm
        politics, and local Spanish-speaking sources. Secondary: Hispanic UX
        researchers running bilingual sessions.
      </p>

      <ul className="mt-10 space-y-6 text-slate-700 leading-relaxed">
        <li>
          <strong className="text-slate-900">Attribution you can defend.</strong>{" "}
          Keep the Spanish clause your source used; note English switches without
          rewriting their voice.
        </li>
        <li>
          <strong className="text-slate-900">Deadline-friendly skimming.</strong>{" "}
          Scan for quotation-ready lines instead of wading through meeting
          summaries and filler.
        </li>
        <li>
          <strong className="text-slate-900">Field + remote.</strong> Long
          interviews, overlapping speech, and code switching are the norm—not
          edge cases.
        </li>
        <li>
          <strong className="text-slate-900">Not a replacement for ethics.</strong>{" "}
          You still verify quotes with sources; we reduce transcription drag.
        </li>
      </ul>

      <p className="mt-10 text-sm text-slate-500">
        {site.phrases.transcribe} · {site.phrases.quoteReady}
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          href="/#waitlist"
          className="rounded-full bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
        >
          Join waitlist
        </Link>
        <Link
          href="/transcribe-spanish-english-interview"
          className="text-sm font-medium text-teal-800 hover:text-teal-900 self-center"
        >
          Spanish–English interview workflow →
        </Link>
      </div>
    </div>
  );
}
