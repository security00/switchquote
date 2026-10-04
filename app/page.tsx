import Link from "next/link";
import { TranscribeApp } from "@/components/TranscribeApp";
import { WaitlistForm } from "@/components/WaitlistForm";
import { site } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="border-b border-rule bg-[linear-gradient(180deg,var(--surface)_0%,var(--paper)_100%)]">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6 sm:pb-20 sm:pt-14">
          <TranscribeApp
            introTop={
              <>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">{site.phrases.transcribe}</p>
                <h1 className="mt-2 max-w-2xl text-[34px] leading-[1.06] sm:mt-4 sm:text-[56px] sm:leading-[1.04]">
                  Quote-ready Spanish–English interview transcripts
                </h1>
              </>
            }
            introBody={
              <div className="lg:-mt-2">
                <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-lg">
                  {site.tagline} Built for US Spanish-beat and LatAm-line journalists who need every code switch on the record—not a meeting summary and not a forced English rewrite.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
                  <span className="rounded-md border border-rule-strong bg-surface px-2.5 py-1 font-medium text-ink">{site.phrases.quoteReady}</span>
                  <span className="rounded-md border border-rule-strong bg-surface px-2.5 py-1 font-medium text-ink">{site.phrases.notMeetingNotes}</span>
                </div>
              </div>
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
          <div className="max-w-2xl space-y-6 text-[15px] leading-relaxed text-ink-soft sm:text-base">
            <p>
              <strong className="font-display text-xl font-medium text-ink">Why not Otter or a meeting bot?</strong>{" "}
              Those tools optimize for stand-ups and Zoom rooms. They collapse speakers, trim overlap, and polish for &ldquo;action items.&rdquo; That is the opposite of an on-the-record interview where you need the exact Spanish phrase your source used—and the English they switched to mid-sentence.
            </p>
            <p>
              <strong className="font-display text-xl font-medium text-ink">Why not Whisper alone?</strong>{" "}
              General ASR can miss rapid code switching, treat Spanglish as noise, or flatten bilingual dialogue into one language. You still spend hours fixing quotes before publish—not ideal on deadline.
            </p>
            <p className="border-l-2 border-es-line pl-4 text-ink">
              SwitchQuote is interview-first: speaker-aware, bilingual-aware, and formatted for pull quotes—not calendar invites.
            </p>
            <Link href="/samples" className="inline-flex font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
              See sample before/after panels →
            </Link>
          </div>
          <WaitlistForm id="waitlist" />
        </div>
      </section>

      <section className="border-t border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl">Private test: prove the transcript quality</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft">
            Uploads are invite-only while we test, and there is no checkout. Join the waitlist, read the samples, and tell us if you run bilingual interviews weekly.
          </p>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
            {[
              { href: "/how-it-works", title: "Transcribe ≠ translate", desc: "Keep both languages on the record." },
              { href: "/for-journalists", title: "For journalists", desc: "Deadlines, attribution, and quote checks." },
              { href: "/otter-alternative-for-journalists", title: "Otter alternative", desc: "When meeting notes are the wrong tool." },
            ].map((card) => (
              <li key={card.href} className="bg-surface">
                <Link href={card.href} className="group block h-full p-6 transition-colors hover:bg-paper">
                  <h3 className="font-display text-xl text-ink">{card.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{card.desc}</p>
                  <span className="mt-4 inline-block font-mono text-xs text-accent transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
