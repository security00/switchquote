import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { site } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-800">
            {site.phrases.transcribe}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Quote-ready Spanish–English interview transcripts
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600 leading-relaxed">
            {site.tagline} Built for US Spanish-beat and LatAm-line journalists
            who need every code switch on the record—not a meeting summary and
            not a forced English rewrite.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {site.phrases.quoteReady}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {site.phrases.notMeetingNotes}
            </span>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
            <WaitlistForm id="waitlist" />
            <div className="space-y-6 text-sm text-slate-600 leading-relaxed">
              <p>
                <strong className="font-medium text-slate-900">
                  Why not Otter or a meeting bot?
                </strong>{" "}
                Those tools optimize for stand-ups and Zoom rooms. They collapse
                speakers, trim overlap, and polish for &ldquo;action items.&rdquo;
                That is the opposite of an on-the-record interview where you need
                the exact Spanish phrase your source used—and the English they
                switched to mid-sentence.
              </p>
              <p>
                <strong className="font-medium text-slate-900">
                  Why not Whisper alone?
                </strong>{" "}
                General ASR can miss rapid code switching, treat Spanglish as
                noise, or flatten bilingual dialogue into one language. You still
                spend hours fixing quotes before publish—not ideal on deadline.
              </p>
              <p>
                SwitchQuote is interview-first: speaker-aware, bilingual-aware,
                and formatted for pull quotes—not calendar invites.
              </p>
              <Link
                href="/samples"
                className="inline-flex font-medium text-teal-800 hover:text-teal-900"
              >
                See sample before/after panels →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold text-slate-900">
          Phase A: prove the transcript quality
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          No upload pipeline or checkout yet. Join the waitlist, read the
          samples, and tell us if you run bilingual interviews weekly.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              href: "/how-it-works",
              title: "Transcribe ≠ translate",
              desc: "Keep both languages on the record.",
            },
            {
              href: "/for-journalists",
              title: "For journalists",
              desc: "Deadlines, attribution, and quote checks.",
            },
            {
              href: "/otter-alternative-for-journalists",
              title: "Otter alternative",
              desc: "When meeting notes are the wrong tool.",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-200 hover:shadow transition-shadow"
            >
              <h3 className="font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{card.desc}</p>
            </Link>
          ))}
        </ul>
      </section>
    </>
  );
}
