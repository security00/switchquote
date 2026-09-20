import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Transcribe Spanish–English interview",
  description:
    "How to transcribe bilingual Spanish–English interviews without auto-translating away the quotes you need.",
};

export default function TranscribeSpanishEnglishPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
        Transcribe a Spanish–English interview
      </h1>
      <p className="mt-4 text-lg text-slate-600 leading-relaxed">
        Bilingual interviews are not “Spanish audio with an English summary.”
        Reporters need both languages represented so editors and lawyers see the
        same words the source said.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        Common failure modes
      </h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-slate-700 leading-relaxed">
        <li>Forced English translation drops legally or emotionally loaded Spanish phrasing.</li>
        <li>Single-language ASR garbles mid-sentence switches.</li>
        <li>Meeting tools merge speakers and erase overlap you need for context.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        A better bar for publish-ready notes
      </h2>
      <p className="mt-3 text-slate-700 leading-relaxed">
        Start from transcription, not translation. Mark speakers. Keep code
        switches intact. Export something you can quote-check before deadline.
        That is the workflow {site.name} is building—starting with waitlist and
        samples in Phase A.
      </p>

      <Link
        href="/samples"
        className="mt-6 inline-flex font-medium text-teal-800 hover:text-teal-900"
      >
        View sample panels →
      </Link>
      <br />
      <Link
        href="/#waitlist"
        className="mt-4 inline-flex font-medium text-teal-800 hover:text-teal-900"
      >
        Join the waitlist →
      </Link>
    </article>
  );
}
