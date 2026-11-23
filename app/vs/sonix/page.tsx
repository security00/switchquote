import type { Metadata } from "next";
import Link from "next/link";
import { TrackedLink } from "@/components/TrackedLink";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: "How do SwitchQuote and Sonix compare for a bilingual interview? | SwitchQuote",
  },
  description:
    "SwitchQuote keeps Spanish and English when an interview switches mid-sentence. This page uses only Sonix's public code-switching note and two list prices. No accuracy percentage.",
};

const SONIX_QUOTE =
  "it performs best when language switches happen between speakers rather than mid-sentence. Rapid code-switching inside a single sentence is the hardest case in speech recognition. For heavily code-switched audio, transcribe in the dominant language and correct the exceptions in the editor.";

const SONIX_NOT_CITED = "Not cited on this page.";

export default function VsSonixPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-brass">Comparison</p>
      <h1 className="mt-2 text-3xl leading-tight sm:text-[44px]">SwitchQuote and Sonix, for a bilingual interview</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        SwitchQuote keeps the Spanish and the English in a bilingual interview transcript, including mid-sentence switches, and marks each switch for review. It is not a meeting-notes tool, and it does not replace the original wording with a translation.
      </p>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        The comparison below is limited to what SwitchQuote does on this site, plus two public Sonix sources already quoted on this page: a note from the Sonix languages page, and two list prices from the October 2026 pricing page. SwitchQuote does not publish an accuracy percentage. The transcript is a draft for a person to check before a quote is published. Transcription is in a private test; you sign in with Google, and there is no anonymous upload.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This page sits next to the{" "}
        <Link href="/otter-alternative-for-journalists" className="font-medium text-accent underline decoration-accent/30 underline-offset-4">
          Otter alternative for journalists
        </Link>
        . It does not copy another product&apos;s site, and it does not invent customer stories or an accuracy percentage.
      </p>

      <figure className="mt-8 border-l-4 border-brass bg-surface px-5 py-4">
        <blockquote className="text-[17px] leading-relaxed text-ink">“{SONIX_QUOTE}”</blockquote>
        <figcaption className="mt-3 text-sm text-ink-faint">
          Sonix, public languages page, quoted in the 23 Nov 2026 teardown from{" "}
          <a href="https://sonix.ai/languages" className="underline decoration-rule-strong underline-offset-4">sonix.ai/languages</a>.
        </figcaption>
      </figure>

      <h2 className="mt-12 text-2xl">Comparison table</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        The table sets SwitchQuote&apos;s bilingual interview desk next to what Sonix states in the public sources cited here. SwitchQuote cells describe the product as it stands on this site. Sonix cells use only the languages-page note and the two October 2026 list prices. Where this page has no cited public source, the cell says so. This is not a scorecard, and it is not an accuracy test.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">SwitchQuote and Sonix comparison skeleton</caption>
          <thead>
            <tr className="border-b border-rule text-ink-faint">
              <th className="py-2 pr-4 font-medium"> </th>
              <th className="py-2 pr-4 font-medium">SwitchQuote</th>
              <th className="py-2 font-medium">Sonix (public)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-rule align-top">
              <th className="py-3 pr-4 font-medium text-ink">Mid-sentence switch</th>
              <td className="py-3 pr-4 text-ink-soft">Both languages stay in the transcript. Each switch is marked Review suggested for a person to check.</td>
              <td className="py-3 text-ink-soft">The public note quoted above: best when the switch is between speakers; for heavy code-switching, transcribe in the dominant language and correct the exceptions in the editor.</td>
            </tr>
            <tr className="border-b border-rule align-top">
              <th className="py-3 pr-4 font-medium text-ink">Language on each word</th>
              <td className="py-3 pr-4 text-ink-soft">ES / EN chips, with underlines that remain if color is turned off. Exports include the language tag.</td>
              <td className="py-3 text-ink-faint">{SONIX_NOT_CITED}</td>
            </tr>
            <tr className="border-b border-rule align-top">
              <th className="py-3 pr-4 font-medium text-ink">Price anchor</th>
              <td className="py-3 pr-4 text-ink-soft">Credits on the pricing page. One credit is about one minute. Packs last 24 months. The signup grant does not require a card.</td>
              <td className="py-3 text-ink-soft">Public list: $10 per audio hour pay as you go, and $25 for 5 hours on the Core plan (October 2026 pricing page).</td>
            </tr>
            <tr className="border-b border-rule align-top">
              <th className="py-3 pr-4 font-medium text-ink">Checkable export</th>
              <td className="py-3 pr-4 text-ink-soft">DOCX, TXT, SRT, VTT, word-level CSV, and NVivo rows, with speaker names, language tags, and review notes.</td>
              <td className="py-3 text-ink-faint">{SONIX_NOT_CITED}</td>
            </tr>
            <tr className="align-top">
              <th className="py-3 pr-4 font-medium text-ink">Accuracy claim</th>
              <td className="py-3 pr-4 text-ink-soft">{site.name} does not publish an accuracy percentage. The draft is for a person to verify.</td>
              <td className="py-3 text-ink-faint">{SONIX_NOT_CITED}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-2xl">What this page is not claiming</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">
        <p>This page does not claim that SwitchQuote is more accurate than Sonix, or that one product is the better choice for every interview. SwitchQuote does not publish an accuracy percentage. A transcript is a draft. A person should verify a quote before it is published.</p>
        <p>It does not invent customer stories, reviews, or scores. It does not add Sonix features, limits, or prices beyond the public languages-page note already quoted above, and the two list prices from the October 2026 pricing page: $10 per audio hour pay as you go, and $25 for 5 hours on Core.</p>
        <p>It is not a page about meeting notes or auto-translation. SwitchQuote is in a private test. Transcription is invite-only, and allowlisted accounts can buy credits.</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-faint">
        Cells marked pending are for the copywriter. The Sonix sentence and the two public prices are the only competitor figures on this page.
      </p>
      <TrackedLink href="/app" src="vs-sonix" className="mt-8 inline-flex rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-strong">
        Try the interview desk
      </TrackedLink>
    </article>
  );
}
