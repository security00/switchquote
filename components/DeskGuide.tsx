function SwitchMark() {
  return (
    <svg viewBox="0 0 12 12" className="mr-0.5 h-[0.95em] w-[0.95em]" aria-hidden="true">
      <path d="M2 4h7.5M7.5 2l2 2-2 2M10 8H2.5M4.5 6l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const steps = [
  {
    n: "01",
    title: "Upload the interview",
    body: "Sign in with Google, then add the audio. You get both languages as spoken, with speakers and timecodes. The audio is not stored.",
  },
  {
    n: "02",
    title: "Check every switch",
    body: "Spanish stays underlined. The ⇄ mark sits on the first word after the language changes. Read that word before you quote it.",
  },
  {
    n: "03",
    title: "Rename, correct, and copy",
    body: "Click a speaker to rename them. Turn on Correct and click a word to fix it — the timecode stays. Select the words and use Copy quote, or copy one turn. The paste includes the name and the clock time.",
  },
] as const;

export function DeskGuide({ sampleOpen = false }: { sampleOpen?: boolean }) {
  return (
    <section aria-labelledby="how-to-use">
      <h2 id="how-to-use" className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        How to use it
      </h2>
      <ol className="mt-3 grid divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {(sampleOpen
          ? [{ n: "01", title: "Start on the sample", body: "It is already open. Use the upload card for a file of your own — that needs a signed-in account." }, ...steps.slice(1)]
          : steps
        ).map((step) => (
          <li key={step.n} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 px-4 py-4 sm:px-5">
            <span className="pt-0.5 font-mono text-xs font-medium text-es">{step.n}</span>
            <div>
              <h3 className="font-display text-lg leading-snug text-ink">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {sampleOpen ? null : <figure className="mt-4 rounded-xl border border-rule bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">Example · not your file</span>
          <span className="text-xs text-ink-soft">A renamed speaker, one switch, and the copied quote</span>
        </figcaption>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch">
          <div className="rounded-lg bg-paper px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-ink">Mayor García</span>
              <span className="font-mono text-[11.5px] text-ink-faint">00:00:12</span>
            </div>
            <p className="mt-2 font-display text-[18px] leading-[1.75] text-ink sm:text-[19px]">
              <span className="lang-es">Pero ellos</span>{" "}
              <span className="switch-tag" aria-hidden="true">
                <SwitchMark />
                EN
              </span>
              <span className="sr-only">switch to English, </span>
              <span className="switch-word">said</span> no.
            </p>
          </div>
          <div className="flex flex-col justify-center">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">What Copy quote pastes</p>
            <blockquote className="mt-2 border-l-[3px] border-mark bg-mark/25 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">
              <p>“Pero ellos said no.”</p>
              <p className="mt-1 text-ink-soft">— Mayor García, 00:00:12</p>
            </blockquote>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          The quote uses the name you typed and the words you corrected. The ⇄ mark stays on the transcript. It does not go into the quote.
        </p>
      </figure>}
    </section>
  );
}
