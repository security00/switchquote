import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Otter alternative for journalists",
  description:
    "Why meeting transcription tools fall short for bilingual on-the-record interviews—and what to look for instead.",
};

export default function OtterAlternativePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
        Otter alternative for journalists
      </h1>
      <p className="mt-4 text-lg text-slate-600 leading-relaxed">
        Otter and similar meeting assistants excel at joining video calls,
        tagging action items, and sharing notes with teammates. That is a
        different job from transcribing a sensitive source interview in
        Spanish and English.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        Filter out meeting bots
      </h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-slate-700 leading-relaxed">
        <li>
          <strong>Bot in the room.</strong> Sources may not consent to a third-party
          recorder joining Zoom—journalists often need a file they control.
        </li>
        <li>
          <strong>Summaries over quotes.</strong> Meeting products compress dialogue
          into takeaways; courts and copy desks need verbatim lines.
        </li>
        <li>
          <strong>Monolingual polish.</strong> Bilingual code switching is treated as
          error correction instead of content you must preserve.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        What interview-first transcription means
      </h2>
      <p className="mt-3 text-slate-700 leading-relaxed">
        {site.name} focuses on {site.phrases.quoteReady.toLowerCase()} output:{" "}
        {site.phrases.transcribe.toLowerCase()}, keep Spanish and English on the
        record, and skip the stand-up template. {site.phrases.notMeetingNotes}.
      </p>

      <p className="mt-6 text-sm text-slate-500">
        We are not claiming Otter is “bad”—it is the wrong shape for many
        bilingual interview workflows.
      </p>

      <Link
        href="/#waitlist"
        className="mt-8 inline-flex font-medium text-teal-800 hover:text-teal-900"
      >
        Join the SwitchQuote waitlist →
      </Link>
    </article>
  );
}
