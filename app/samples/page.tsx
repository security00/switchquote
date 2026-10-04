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
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="text-sm font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">
        Sample — illustrative only
      </p>
      <h1 className="mt-3 text-3xl text-ink sm:text-[44px] leading-tight">
        Before / after: interview vs meeting-bot output
      </h1>
      <p className="mt-4 max-w-2xl text-ink-soft leading-relaxed">
        These panels are fictional examples showing what journalists often fight
        after generic transcription—not SwitchQuote output. Real uploads are in a
        private test now.
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

      <p className="mt-10 text-sm text-ink-faint">
        {site.phrases.transcribe} · {site.phrases.quoteReady}
      </p>
      <Link
        href="/#waitlist"
        className="mt-4 inline-flex font-medium text-accent hover:text-accent-strong"
      >
        Join the waitlist →
      </Link>
    </div>
  );
}
