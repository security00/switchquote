import type { Metadata } from "next";
import Link from "next/link";
import { SampleWall } from "@/components/SampleWall";
import { TrackedLink } from "@/components/TrackedLink";

export const metadata: Metadata = {
  title: {
    absolute: "How do I transcribe Spanglish that switches mid-sentence? | SwitchQuote",
  },
  description:
    "Keep both languages when a Spanish–English interview switches mid-sentence. Switches are marked for review, and the original wording stays. The sample is a fictional illustration.",
};

export default function SpanglishPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brass">Spanish–English</p>
      <h1 className="mt-2 max-w-3xl text-3xl leading-tight sm:text-[48px]">Spanglish transcription for the sentence that changes language halfway through</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        A desk for interviews where Spanish and English share a sentence. The original wording stays. An English line can sit beside it. Switches are marked for review.
      </p>
      <div className="mt-4 max-w-2xl space-y-3 text-sm leading-relaxed text-ink-soft">
        <p>
          When a source starts a sentence in one language and finishes it in the other, both stretches stay in the transcript, in the order they were spoken. Each word carries an ES or EN chip. If color is turned off, the underline remains. The first word after a language change is marked Review suggested, so a person can check the line before it is quoted.
        </p>
        <p>
          An English reference line can sit beside the original. It does not replace the Spanish, and it is not the transcript of record. You can rename a speaker, including P01 / P02, add a review note, and copy a quote with the name and the timecode. Exports in DOCX, TXT, SRT, VTT, word-level CSV, and NVivo keep the speaker names, language tags, and review notes.
        </p>
        <p>
          Sign in with Google to transcribe an interview. There is no anonymous upload. The signup grant is 20 credits, about 20 minutes, and it does not require a card. SwitchQuote does not store the audio, and it does not use your audio or transcripts to train models. Transcripts are kept for 30 days, or until you click Delete. Transcription is in a private test and is invite-only.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <TrackedLink href="/app" src="spanglish" className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-strong">
          Transcribe a mixed interview
        </TrackedLink>
        <Link href="/#sample" className="rounded-md border border-rule-strong bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-ink/30">
          Open the homepage sample
        </Link>
      </div>

      <section className="mt-12" aria-labelledby="spanglish-sample">
        <h2 id="spanglish-sample" className="text-2xl">Interactive sample</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The panel below is a fictional illustration of a sentence that changes language halfway through. It is not a customer recording, not a real interview, and not the output of a live upload. You can rename a speaker, correct a word, or copy a quote in the browser. Nothing is uploaded. Attach a local audio file in the player only if you want those timecodes to play.
        </p>
        <div className="mt-6">
          <SampleWall />
        </div>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-2xl">What stays in the transcript</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">A quote-ready transcript keeps the words that were spoken. It is not a translation of the interview, and it is not a meeting summary. On SwitchQuote, that includes:</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>The Spanish and the English, in the order they were spoken.</li>
          <li>A Review suggested mark on each language switch.</li>
          <li>An English reference line that does not replace the original.</li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Those same marks travel with the export: speaker names, language tags, and review notes stay in the DOCX, TXT, SRT, VTT, word-level CSV, and NVivo files.
        </p>
      </section>

      <section className="mt-12 rounded-2xl border border-ink bg-ink px-6 py-8 text-white">
        <h2 className="font-display text-3xl text-white">No credit card required</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">20 free credits ≈ 20 minutes. Google sign-in. No anonymous transcription.</p>
        <TrackedLink href="/app" src="spanglish" className="mt-5 inline-flex rounded-md bg-mark px-5 py-3 text-sm font-semibold text-ink">
          Start with the free credits
        </TrackedLink>
      </section>
    </article>
  );
}
