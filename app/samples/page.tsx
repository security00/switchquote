import type { Metadata } from "next";
import Link from "next/link";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Samples",
  description:
    "Illustrative before/after Spanglish interview transcript panels. Sample only—not from a live upload.",
};

const genericBefore = [
  "Speaker 1: So we talked about the border and like the family stayed in Mexico.",
  "Speaker 2: Yeah they said no van a cruzar until the lawyer calls.",
  "Speaker 1: Meeting ended — action items captured.",
];

const genericAfter = [
  "Source: We talked about the border—the family stayed in Mexico.",
  "Source: They said, “No van a cruzar until the lawyer calls.”",
  "Reporter: [overlap] Right, and you were translating for your mom?",
];

const spanglishBefore = [
  "…going to the clinic mañana because the insurance still pending…",
  "…she said está complicado but we have to try…",
];

const spanglishAfter = [
  "Source: I’m going to the clinic mañana because the insurance is still pending.",
  "Source: She said, “Está complicado,” but we have to try.",
];

export default function SamplesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-amber-800">
        Sample — illustrative only
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
        Before / after: interview vs meeting-bot output
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600 leading-relaxed">
        These panels are fictional examples showing what journalists often fight
        after generic transcription—not output from SwitchQuote production yet.
        Real uploads arrive after Phase A.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <TranscriptPanel
          title="Meeting-style capture"
          subtitle="Sample · Before"
          variant="before"
          lines={genericBefore}
        />
        <TranscriptPanel
          title="Quote-ready interview lines"
          subtitle="Sample · After"
          variant="after"
          lines={genericAfter}
        />
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <TranscriptPanel
          title="ASR flattening Spanglish"
          subtitle="Sample · Before"
          variant="before"
          lines={spanglishBefore}
        />
        <TranscriptPanel
          title="Spanish kept, English kept"
          subtitle="Sample · After"
          variant="after"
          lines={spanglishAfter}
        />
      </div>

      <p className="mt-10 text-sm text-slate-500">
        {site.phrases.transcribe} · {site.phrases.quoteReady}
      </p>
      <Link
        href="/#waitlist"
        className="mt-4 inline-flex font-medium text-teal-800 hover:text-teal-900"
      >
        Join the waitlist →
      </Link>
    </div>
  );
}
