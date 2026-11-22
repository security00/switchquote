import type { Metadata } from "next";
import Link from "next/link";
import { SampleWall } from "@/components/SampleWall";
import { TrackedLink } from "@/components/TrackedLink";

export const metadata: Metadata = {
  title: "Spanglish transcription",
  description: "A page skeleton for mixed Spanish–English interview transcription. Body copy is pending. The sample on this page is an illustration.",
};

export default function SpanglishPage() {
  return (
    <article className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brass">Spanish–English</p>
      <h1 className="mt-2 max-w-3xl text-3xl leading-tight sm:text-[48px]">Spanglish transcription for the sentence that changes language halfway through</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        A desk for interviews where Spanish and English share a sentence. The original wording stays. An English line can sit beside it. Switches are marked for review.
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-faint">[Editorial copy pending]</p>
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
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">[Editorial copy pending]</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-faint">This embed is a fictional illustration. It is not a customer recording and not a live upload.</p>
        <div className="mt-6">
          <SampleWall />
        </div>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-2xl">What stays in the transcript</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">[Editorial copy pending]</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>The Spanish and the English, in the order they were spoken.</li>
          <li>A Review suggested mark on each language switch.</li>
          <li>An English reference line that does not replace the original.</li>
        </ul>
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
