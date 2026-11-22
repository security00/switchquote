"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  applyTranscriptEdit,
  clock,
  durationLabel,
  formatQuote,
  formatSegmentQuote,
  isLowConfidence,
  normalizeSpeakerName,
  segmentText,
  speakerLabel,
  switchPoints,
  toCsv,
  toJson,
  toNvivo,
  toSrt,
  toTxt,
  toVtt,
  translationIsComplete,
  type Lang,
  type SegmentLang,
  type Transcript,
  type WordRef,
} from "@/lib/transcript";
import { toDocx } from "@/lib/docx";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const LANGS: { id: Lang; label: string }[] = [
  { id: "es", label: "ES" },
  { id: "en", label: "EN" },
  { id: "other", label: "Other" },
];

function SwitchArrows() {
  return (
    <svg viewBox="0 0 12 12" className="mr-0.5 h-[0.95em] w-[0.95em]" aria-hidden="true">
      <path d="M2 4h7.5M7.5 2l2 2-2 2M10 8H2.5M4.5 6l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function langChip(lang: SegmentLang): string {
  if (lang === "es") return "bg-es-tint text-es ring-1 ring-es-line/40";
  if (lang === "en") return "bg-en-tint text-en ring-1 ring-en/30";
  if (lang === "mixed") return "text-ink ring-1 ring-ink/30 [background:linear-gradient(90deg,var(--es-tint)_50%,var(--en-tint)_50%)]";
  return "bg-paper text-ink-faint ring-1 ring-rule";
}

function chipCode(lang: Lang): string {
  if (lang === "es") return "ES";
  if (lang === "en") return "EN";
  return "–";
}

function wordRangeFromSelection(root: HTMLElement): { from: WordRef; to: WordRef } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const refs: WordRef[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("[data-si][data-wi]")) {
    try {
      if (range.intersectsNode(el)) refs.push({ si: Number(el.dataset.si), wi: Number(el.dataset.wi) });
    } catch {
      /* The node can detach between selection changes. */
    }
  }
  if (!refs.length || refs.some((ref) => Number.isNaN(ref.si) || Number.isNaN(ref.wi))) return null;
  refs.sort((a, b) => a.si - b.si || a.wi - b.wi);
  return { from: refs[0], to: refs[refs.length - 1] };
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function TranscriptView({
  transcript,
  busy,
  onTranslate,
  onDelete,
  onChange,
  persist = true,
  flushTop = false,
  audioUrl = null,
}: {
  transcript: Transcript;
  busy: "" | "upload" | "translate";
  onTranslate: () => void;
  onDelete: () => void;
  onChange: (next: Transcript) => void;
  /** When false, edits stay in the browser. Used for the homepage sample. */
  persist?: boolean;
  flushTop?: boolean;
  /** Blob or remote URL for the interview audio, when the browser still has the file. */
  audioUrl?: string | null;
}) {
  const bodyRef = useRef<HTMLOListElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState<{ si: number; wi: number; w: string; lang: Lang } | null>(null);
  const [renaming, setRenaming] = useState<{ si: number; speaker: number; name: string } | null>(null);
  const [lineDraft, setLineDraft] = useState<{ si: number; text: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ si: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [status, setStatus] = useState("");
  const [showLangColor, setShowLangColor] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [findAt, setFindAt] = useState(0);
  const [switchAt, setSwitchAt] = useState(-1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const renameCancel = useRef(false);
  const localUrlRef = useRef<string | null>(null);
  const switches = useMemo(() => switchPoints(transcript.segments), [transcript.segments]);
  const switchList = useMemo(() => [...switches], [switches]);
  const englishReady = translationIsComplete(transcript.segments, transcript.translation);
  const base = transcript.filename.replace(/\.[^.]+$/, "") || "transcript";
  const btn = "rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-50";
  const activeUrl = localUrl || audioUrl || "";
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [] as WordRef[];
    const out: WordRef[] = [];
    transcript.segments.forEach((s, si) => s.words.forEach((w, wi) => {
      if (w.w.toLowerCase().includes(q)) out.push({ si, wi });
    }));
    return out;
  }, [find, transcript.segments]);
  const openReviews = useMemo(() => {
    let n = 0;
    transcript.segments.forEach((s, si) => s.words.forEach((w, wi) => {
      if ((switches.has(`${si}:${wi}`) || w.needsReview) && !w.reviewed) n += 1;
    }));
    return n;
  }, [switches, transcript.segments]);
  const hasConfidence = transcript.segments.some((s) => s.words.some((w) => typeof w.confidence === "number"));

  useEffect(() => {
    const onSelection = () => setHasSelection(bodyRef.current ? wordRangeFromSelection(bodyRef.current) !== null : false);
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, activeUrl]);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const hit = matches[findAt];
    if (!hit || !bodyRef.current) return;
    bodyRef.current.querySelector<HTMLElement>(`[data-si="${hit.si}"][data-wi="${hit.wi}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [findAt, matches]);

  function note(message: string) {
    setStatus(message);
  }

  function seek(sec: number) {
    const el = audioRef.current;
    if (!el || !activeUrl) {
      note("Attach the audio file to play from this word.");
      return;
    }
    el.currentTime = Math.max(0, sec);
    void el.play().catch(() => note("Couldn't start playback."));
  }

  function jumpSwitch(dir: 1 | -1) {
    if (!switchList.length || !bodyRef.current) return;
    const next = switchAt < 0 ? (dir === 1 ? 0 : switchList.length - 1) : (switchAt + dir + switchList.length) % switchList.length;
    setSwitchAt(next);
    const [si, wi] = switchList[next].split(":").map(Number);
    bodyRef.current.querySelector<HTMLElement>(`[data-si="${si}"][data-wi="${wi}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function commit(body: unknown) {
    if (saving) return;
    const edited = applyTranscriptEdit(transcript, body);
    if (!edited.ok) {
      note(edited.error);
      return;
    }
    setDraft(null);
    setRenaming(null);
    setLineDraft(null);
    setNoteDraft(null);
    const previous = transcript;
    onChange(edited.transcript);
    if (!persist) {
      note("Updated.");
      return;
    }
    setSaving(true);
    note("Saving…");
    try {
      const res = await fetch(`/api/transcripts/${transcript.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; transcript?: Transcript };
      if (!res.ok || !data.transcript) {
        onChange(previous);
        note(data.error || "Couldn't save that change.");
        return;
      }
      onChange(data.transcript);
      note("Saved.");
    } catch {
      onChange(previous);
      note("Couldn't save that change.");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string | null, key: string) {
    if (!text) {
      note("Select the words you want to quote.");
      return;
    }
    if (!(await writeClipboard(text))) {
      note("Couldn't copy that quote.");
      return;
    }
    setCopiedKey(key);
    note("Copied.");
    window.setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 2000);
  }

  function copySelection() {
    const range = bodyRef.current ? wordRangeFromSelection(bodyRef.current) : null;
    void copyText(range ? formatQuote(transcript, range.from, range.to) : null, "sel");
  }

  function saveRename() {
    if (!renaming || renameCancel.current) {
      renameCancel.current = false;
      return;
    }
    const name = normalizeSpeakerName(renaming.name);
    if (name === null) {
      note("Use a speaker name of 80 characters or fewer.");
      return;
    }
    const current = transcript.speakers?.[String(renaming.speaker)] ?? "";
    setRenaming(null);
    if (name === current) return;
    void commit({ op: "speaker", speaker: renaming.speaker, name });
  }

  function saveDraft() {
    if (!draft) return;
    void commit({ op: "word", si: draft.si, wi: draft.wi, w: draft.w, lang: draft.lang });
  }

  function deleteDraftWord() {
    if (!draft) return;
    const turn = transcript.segments[draft.si];
    if (turn && turn.words.length === 1 && !window.confirm("Delete this whole turn? This can't be undone.")) return;
    void commit({ op: "delete_word", si: draft.si, wi: draft.wi });
  }

  function openWord(si: number, wi: number, w: string, lang: Lang) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    setRenaming(null);
    setDraft({ si, wi, w, lang });
  }

  function attachAudio(file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = url;
    setLocalUrl(url);
    note("Audio attached for playback.");
  }

  const safeFindAt = matches.length ? Math.min(findAt, matches.length - 1) : 0;

  return (
    <section
      className={`${flushTop ? "" : "mt-10"} overflow-clip rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(28,25,21,0.04),0_12px_32px_-16px_rgba(28,25,21,0.18)]`}
      aria-label="Transcript"
      data-lang-color={showLangColor ? "on" : "off"}
      data-confidence={showConfidence ? "on" : "off"}
    >
      <div className="z-10 border-b border-rule bg-surface/95 px-4 py-4 backdrop-blur sm:px-8 sm:py-5 md:sticky md:top-14">
        <div className="min-w-0">
          <h2 className="truncate text-2xl leading-tight">{transcript.filename}</h2>
          <p className="mt-1 font-mono text-[11.5px] text-ink-faint">
            {durationLabel(transcript.durationSec)} · {transcript.segments.length} segments · {switches.size} language switches · {openReviews} Review suggested ·{" "}
            <span className="rounded-sm bg-mark/60 px-1 font-sans font-medium text-ink">AI draft — verify quotes before publishing</span>
          </p>
          {persist ? null : (
            <div className="mt-2 max-w-3xl space-y-1">
              <p className="text-sm leading-relaxed text-ink-soft">Sample on this page. Rename a speaker, correct a word, or copy a quote. Nothing is uploaded.</p>
              <p className="text-sm leading-relaxed text-ink-soft">
                Audio is sent to our speech-to-text provider and is not stored by SwitchQuote. We don&apos;t use your audio or transcripts to train models. Transcripts are kept for 30 days, or until you click Delete.{" "}
                <Link href="/privacy" className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">Privacy</Link>
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Playback">
          <button type="button" onClick={() => (playing ? audioRef.current?.pause() : seek(playhead || transcript.segments[0]?.start || 0))} disabled={!activeUrl} className={btn}>
            {playing ? "Pause" : "Play"}
          </button>
          <span className="font-mono text-[11px] text-ink-faint">{clock(playhead)}</span>
          {SPEEDS.map((rate) => (
            <button key={rate} type="button" aria-pressed={speed === rate} onClick={() => setSpeed(rate)} className={speed === rate ? "rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-white" : "rounded-md px-2 py-1 text-[12px] font-medium text-ink-soft hover:bg-paper"}>
              {rate}x
            </button>
          ))}
          <label className="text-[12px] font-medium text-ink-soft">
            <span className="sr-only">Attach audio for synced playback</span>
            <input type="file" accept="audio/*,video/mp4,.mp3,.m4a,.mp4,.wav,.ogg,.flac" onChange={(e) => attachAudio(e.target.files?.[0] ?? null)} className="max-w-[220px] text-[12px] file:mr-2 file:rounded-md file:border file:border-rule-strong file:bg-paper file:px-2 file:py-1 file:text-[12px] file:font-medium file:text-ink" />
          </label>
          <audio ref={audioRef} src={activeUrl || undefined} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={() => setPlayhead(audioRef.current?.currentTime ?? 0)} />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1"><span className="lang-chip lang-chip-es" aria-hidden="true">ES</span><span className="lang-es px-1">Spanish</span><span className="sr-only">underlined</span></span>
          <span className="inline-flex items-center gap-1"><span className="lang-chip lang-chip-en" aria-hidden="true">EN</span><span className="lang-en px-1">English</span><span className="sr-only">dotted underline</span></span>
          <span className="inline-flex items-center gap-1"><span className="review-flag"><SwitchArrows />Review suggested</span> first word after a language change</span>
          <button type="button" aria-pressed={showLangColor} onClick={() => setShowLangColor((on) => !on)} className={btn}>{showLangColor ? "Language colors on" : "Language colors off"}</button>
          <button type="button" aria-pressed={showConfidence} onClick={() => setShowConfidence((on) => !on)} className={btn}>{showConfidence ? "Confidence marks on" : "Confidence marks off"}</button>
        </p>
        {!hasConfidence && showConfidence ? <p className="mt-2 text-xs text-ink-faint">This transcript has no per-word confidence scores. Low-confidence underlines appear when an engine sends them.</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{switches.size} switches</p>
          <button type="button" onClick={() => jumpSwitch(-1)} disabled={!switchList.length} className={btn}>Previous switch</button>
          <button type="button" onClick={() => jumpSwitch(1)} disabled={!switchList.length} className={btn}>Next switch</button>
          <button type="button" onClick={() => void commit({ op: "anonymize" })} disabled={!transcript.segments.length || saving} className={btn}>Name speakers P01, P02</button>
        </div>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches.length) return;
            setFindAt((i) => (i + 1) % matches.length);
          }}
        >
          <label className="text-[12px] font-medium text-ink-soft">
            Find
            <input value={find} onChange={(e) => { setFind(e.target.value); setFindAt(0); }} className="ml-2 w-32 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-[12px] font-medium text-ink-soft">
            Replace
            <input value={replace} onChange={(e) => setReplace(e.target.value)} className="ml-2 w-32 rounded-md border border-rule-strong bg-paper px-2 py-1 text-sm text-ink" />
          </label>
          <span className="font-mono text-[11px] text-ink-faint">{matches.length ? `${safeFindAt + 1} / ${matches.length}` : "0 matches"}</span>
          <button type="button" onClick={() => matches.length && setFindAt((i) => (i - 1 + matches.length) % matches.length)} disabled={!matches.length} className={btn}>Previous</button>
          <button type="submit" disabled={!matches.length} className={btn}>Next</button>
          <button type="button" disabled={!matches.length || saving} onClick={() => void commit({ op: "replace", find, replacement: replace, all: false, index: safeFindAt })} className={btn}>Replace</button>
          <button type="button" disabled={!matches.length || saving} onClick={() => void commit({ op: "replace", find, replacement: replace, all: true })} className={btn}>Replace all</button>
        </form>
        <div className="mt-4 flex flex-col gap-3 border-t border-rule pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">On this transcript</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={copySelection} className={hasSelection ? "rounded-md border border-accent bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent" : btn}>
                {copiedKey === "sel" ? "Copied" : "Copy quote"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!persist) {
                    note("Upload your own interview to refresh the English reference.");
                    return;
                  }
                  onTranslate();
                }}
                disabled={busy !== "" || englishReady}
                className="rounded-md border border-accent bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-60 disabled:hover:bg-accent-tint disabled:hover:text-accent"
              >
                {busy === "translate" ? "Translating…" : englishReady ? "English shown" : transcript.translation ? "Update English" : "Translate to English"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Export</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex flex-wrap overflow-hidden rounded-md border border-rule-strong [&>button]:rounded-none [&>button]:border-0 [&>button+button]:border-l [&>button+button]:border-rule-strong">
                <button type="button" onClick={() => download(`${base}.txt`, toTxt(transcript), "text/plain")} className={btn}>TXT</button>
                <button type="button" onClick={() => download(`${base}.srt`, toSrt(transcript), "application/x-subrip")} className={btn}>SRT</button>
                <button type="button" onClick={() => download(`${base}.vtt`, toVtt(transcript), "text/vtt")} className={btn}>VTT</button>
                <button type="button" onClick={() => download(`${base}.csv`, toCsv(transcript), "text/csv")} className={btn}>CSV</button>
                <button type="button" onClick={() => download(`${base}-nvivo.txt`, toNvivo(transcript), "text/plain")} className={btn}>NVivo</button>
                <button type="button" onClick={() => download(`${base}.json`, toJson(transcript), "application/json")} className={btn}>JSON</button>
                <button type="button" onClick={() => download(`${base}.docx`, toDocx(transcript) as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")} className={btn}>DOCX</button>
              </span>
              <button type="button" onClick={onDelete} className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-red-700 hover:bg-red-50">{persist ? "Delete" : "Reset sample"}</button>
            </div>
          </div>
        </div>
        {status ? <p role="status" className="mt-3 text-xs font-medium text-ink">{status}</p> : null}
      </div>
      <ul className="grid gap-2 border-b border-rule bg-paper/70 px-4 py-3 sm:grid-cols-3 sm:px-8">
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Rename.</span> Click the speaker. The name is used in the quote and in every export. P01 / P02 anonymizes the whole file.</li>
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Edit a word.</span> Click it to change the text, language, review mark, or delete it. Click the timecode to play from there.</li>
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Copy quote.</span> Select words, or copy one turn. The name and clock time come with it.</li>
      </ul>

      <ol ref={bodyRef} className="divide-y divide-rule">
        {transcript.segments.map((s, si) => (
          <li key={`${s.start}-${si}`} className="grid gap-x-8 gap-y-3 px-4 py-5 sm:px-8 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft md:flex-col md:items-start md:pt-1.5">
              <div className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.speaker % 2 ? "border-2 border-ink" : "bg-ink"}`} aria-hidden="true" />
                {renaming?.si === si ? (
                  <span className="flex flex-col gap-1">
                    <input
                      autoFocus
                      aria-label={`Name for ${speakerLabel(s.speaker, transcript.speakers)}`}
                      value={renaming.name}
                      maxLength={80}
                      placeholder="Source name"
                      disabled={saving}
                      onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          renameCancel.current = true;
                          setRenaming(null);
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      className="w-36 rounded border border-rule-strong bg-paper px-1.5 py-0.5 text-xs font-semibold text-ink"
                    />
                    <span className="flex gap-1">
                      {["P01", "P02"].map((preset) => (
                        <button key={preset} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setRenaming({ ...renaming, name: preset })} className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-rule">{preset}</button>
                      ))}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setRenaming({ si, speaker: s.speaker, name: transcript.speakers?.[String(s.speaker)] ?? "" });
                    }}
                    title="Rename this speaker everywhere, including exports"
                    className="rounded-sm text-left underline decoration-dotted decoration-rule-strong underline-offset-4 hover:decoration-accent"
                  >
                    {speakerLabel(s.speaker, transcript.speakers)}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => seek(s.start)} className="font-mono text-[11.5px] text-ink-faint underline decoration-dotted underline-offset-4" title="Play from this timestamp">
                {clock(s.start)}
              </button>
              <span className={`rounded-sm px-1.5 py-px font-mono text-[10.5px] font-semibold uppercase tracking-wider ${langChip(s.lang)}`}>{s.lang}</span>
              <button type="button" onClick={() => void copyText(formatSegmentQuote(transcript, si), `seg:${si}`)} className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                {copiedKey === `seg:${si}` ? "Copied" : "Copy quote"}
              </button>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">Original</p>
              <div className="font-display text-[18px] leading-[1.85] text-ink sm:text-[19px]" data-testid="segment">
                {s.words.map((w, wi) => {
                  const sw = switches.has(`${si}:${wi}`);
                  const review = sw || Boolean(w.needsReview);
                  const editing = draft?.si === si && draft.wi === wi;
                  const hit = matches[safeFindAt];
                  const active = Boolean(find.trim() && hit && hit.si === si && hit.wi === wi);
                  const mark = [
                    w.lang === "es" ? "lang-es" : "",
                    w.lang === "en" ? "lang-en" : "",
                    w.lang === "other" ? "lang-other" : "",
                    sw ? "switch-word" : "",
                    review && !w.reviewed ? "review-suggested" : "",
                    isLowConfidence(w.confidence) ? "conf-low" : "",
                    active ? "find-hit" : "",
                  ].filter(Boolean).join(" ");
                  const tip = [
                    review ? (w.reviewed ? "Reviewed" : "Review suggested") : w.lang === "es" ? "Spanish" : w.lang === "en" ? "English" : "Other",
                    typeof w.confidence === "number" ? `Confidence ${Math.round(w.confidence * 100)}%` : "",
                  ].filter(Boolean).join(" · ");
                  return (
                    <span key={`${w.start}-${wi}`} data-si={si} data-wi={wi} data-lang={w.lang} data-switch={sw ? "1" : undefined}>
                      {wi ? " " : null}
                      {review ? <span className={w.reviewed ? "review-flag review-flag-done" : "review-flag"}>{w.reviewed ? "Reviewed" : "Review suggested"}</span> : null}
                      <span className={`lang-chip lang-chip-${w.lang}`} aria-hidden="true">{chipCode(w.lang)}</span>
                      {editing ? (
                        <input
                          autoFocus
                          aria-label="Edit this word"
                          value={draft.w}
                          disabled={saving}
                          onChange={(e) => setDraft({ ...draft, w: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveDraft();
                            }
                            if (e.key === "Escape") setDraft(null);
                          }}
                          style={{ width: `${Math.min(40, Math.max(4, draft.w.length + 1))}ch` }}
                          className={`rounded border border-accent bg-paper px-1 font-display text-[18px] ${draft.lang === "es" ? "lang-es" : draft.lang === "en" ? "lang-en" : ""}`}
                        />
                      ) : (
                        <button type="button" onClick={() => openWord(si, wi, w.w, w.lang)} className={`rounded-sm text-left ${mark}`} title={tip}>
                          <span className="sr-only">{w.lang === "es" ? "Spanish " : w.lang === "en" ? "English " : "Other "}</span>
                          {w.w}
                        </button>
                      )}
                      {w.suggestion?.text ? <span className="suggestion-hint">Suggest {w.suggestion.text}</span> : w.suggestion?.lang ? <span className="suggestion-hint">Suggest {w.suggestion.lang.toUpperCase()}</span> : null}
                    </span>
                  );
                })}
              </div>
              {draft?.si === si && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint">Language</span>
                  {LANGS.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      aria-pressed={draft.lang === lang.id}
                      disabled={saving}
                      onClick={() => setDraft({ ...draft, lang: lang.id })}
                      className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider ${draft.lang === lang.id ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-rule"}`}
                    >
                      {lang.label}
                    </button>
                  ))}
                  <button type="button" onClick={saveDraft} disabled={saving} className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50">Save</button>
                  {transcript.segments[draft.si]?.words[draft.wi]?.suggestion ? (
                    <button type="button" disabled={saving} onClick={() => void commit({ op: "accept_suggestion", si: draft.si, wi: draft.wi })} className={btn}>Use suggestion</button>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const word = transcript.segments[draft.si]?.words[draft.wi];
                      if (!word) return;
                      void commit({ op: "review_word", si: draft.si, wi: draft.wi, reviewed: !word.reviewed });
                    }}
                    className={btn}
                  >
                    {transcript.segments[draft.si]?.words[draft.wi]?.reviewed ? "Mark not reviewed" : "Mark reviewed"}
                  </button>
                  <button type="button" onClick={() => seek(transcript.segments[draft.si]?.words[draft.wi]?.start ?? s.start)} className={btn}>Play word</button>
                  <button type="button" onClick={deleteDraftWord} disabled={saving} className="rounded-md px-2 py-1 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete word</button>
                  <button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-soft hover:text-ink">Cancel</button>
                </div>
              )}
            </div>
            <div className="min-w-0 border-rule md:border-l md:pl-6">
              <label className="block text-[15px] leading-relaxed text-ink-soft" aria-label="English translation">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">English translation</span>
                <textarea
                  value={lineDraft?.si === si ? lineDraft.text : (transcript.translation?.[si] ?? "")}
                  rows={3}
                  disabled={saving}
                  placeholder={transcript.translation ? "Out of date — edit this line or use Update English." : "Write the English line, or translate the file."}
                  onFocus={() => setLineDraft({ si, text: transcript.translation?.[si] ?? "" })}
                  onChange={(e) => setLineDraft({ si, text: e.target.value })}
                  onBlur={() => {
                    if (lineDraft?.si !== si) return;
                    const current = transcript.translation?.[si] ?? "";
                    const text = lineDraft.text;
                    setLineDraft(null);
                    if (text.trim() === current.trim()) return;
                    void commit({ op: "translation", si, text });
                  }}
                  className="mt-1 w-full resize-y rounded-md border border-rule bg-paper px-2 py-1.5 text-[15px] italic leading-relaxed text-ink"
                />
              </label>
              <label className="mt-2 block">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">Review note</span>
                <input
                  value={noteDraft?.si === si ? noteDraft.text : (s.note ?? "")}
                  disabled={saving}
                  placeholder="Fact-check this quote"
                  onFocus={() => setNoteDraft({ si, text: s.note ?? "" })}
                  onChange={(e) => setNoteDraft({ si, text: e.target.value })}
                  onBlur={() => {
                    if (noteDraft?.si !== si) return;
                    const text = noteDraft.text;
                    setNoteDraft(null);
                    if (text.trim() === (s.note ?? "").trim()) return;
                    void commit({ op: "note", si, note: text });
                  }}
                  className="mt-1 w-full rounded-md border border-rule bg-paper px-2 py-1.5 text-sm text-ink"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>
      {transcript.segments.length === 0 && <p className="px-8 py-6 text-sm text-ink-faint">No speech found in this file.</p>}
      <p className="sr-only">{transcript.segments.map(segmentText).join(" ")}</p>
    </section>
  );
}
