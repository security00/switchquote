"use client";

import { useMemo, useState } from "react";
import { TranscriptView } from "@/components/TranscriptView";
import { sampleTranscript } from "@/lib/sample-transcript";
import { durationLabel, speakerLabel, switchPoints, type Transcript } from "@/lib/transcript";

/** Illustrative bilingual sample. Edits stay in the browser. */
export function SampleWall() {
  const [transcript, setTranscript] = useState<Transcript>(() => structuredClone(sampleTranscript));
  const switches = useMemo(() => switchPoints(transcript.segments), [transcript.segments]);
  const speakers = [...new Set(transcript.segments.map((s) => s.speaker))];

  return (
    <div id="sample" className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-rule bg-surface p-5 shadow-[0_1px_2px_rgba(28,25,21,0.04)] lg:sticky lg:top-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brass">Source</p>
        <h3 className="mt-2 font-display text-2xl text-ink">{transcript.filename}</h3>
        <dl className="mt-4 space-y-2 text-sm text-ink-soft">
          <div className="flex justify-between gap-3"><dt>Duration</dt><dd className="font-mono text-xs text-ink">{durationLabel(transcript.durationSec)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Switches</dt><dd className="font-mono text-xs text-ink">{switches.size}</dd></div>
          <div className="flex justify-between gap-3"><dt>Speakers</dt><dd className="text-right text-ink">{speakers.map((n) => speakerLabel(n, transcript.speakers)).join(", ")}</dd></div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">Illustrative sample. Not a customer recording, and not the output of a live upload.</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">The right side keeps each word&apos;s language chip, marks every switch as Review suggested, and shows an English line beside the original. Attach a local audio file in the player if you want those timecodes to play.</p>
      </aside>
      <TranscriptView
        transcript={transcript}
        busy=""
        persist={false}
        flushTop
        onTranslate={() => undefined}
        onDelete={() => setTranscript(structuredClone(sampleTranscript))}
        onChange={setTranscript}
      />
    </div>
  );
}
