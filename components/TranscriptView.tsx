"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  applyTranscriptEdit,
  clock,
  durationLabel,
  formatQuote,
  formatSegmentQuote,
  normalizeSpeakerName,
  segmentText,
  speakerLabel,
  switchPoints,
  toJson,
  toSrt,
  toTxt,
  translationIsComplete,
  type Lang,
  type SegmentLang,
  type Transcript,
  type WordRef,
} from "@/lib/transcript";
import { toDocx } from "@/lib/docx";

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

const LANGS: { id: Lang; label: string }[] = [
  { id: "es", label: "ES" },
  { id: "en", label: "EN" },
  { id: "other", label: "Other" },
];

export function TranscriptView({
  transcript,
  busy,
  onTranslate,
  onDelete,
  onChange,
  persist = true,
  flushTop = false,
}: {
  transcript: Transcript;
  busy: "" | "upload" | "translate";
  onTranslate: () => void;
  onDelete: () => void;
  onChange: (next: Transcript) => void;
  /** When false, edits stay in the browser. Used for the homepage sample. */
  persist?: boolean;
  flushTop?: boolean;
}) {
  const bodyRef = useRef<HTMLOListElement>(null);
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState<{ si: number; wi: number; w: string; lang: Lang } | null>(null);
  const [renaming, setRenaming] = useState<{ si: number; speaker: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [status, setStatus] = useState("");
  const renameCancel = useRef(false);
  const switches = useMemo(() => switchPoints(transcript.segments), [transcript.segments]);
  const englishReady = translationIsComplete(transcript.segments, transcript.translation);
  const base = transcript.filename.replace(/\.[^.]+$/, "") || "transcript";
  const btn = "rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-50";

  useEffect(() => {
    const onSelection = () => setHasSelection(bodyRef.current ? wordRangeFromSelection(bodyRef.current) !== null : false);
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  function note(message: string) {
    setStatus(message);
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
      setDraft(null);
      setRenaming(null);
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

  return (
    <section className={`${flushTop ? "" : "mt-10"} overflow-clip rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.16)]`} aria-label="Transcript">
      <div className="z-10 border-b border-rule bg-surface/95 px-4 py-4 backdrop-blur sm:px-8 sm:py-5 md:sticky md:top-14">
        <div className="min-w-0">
          <h2 className="truncate text-2xl leading-tight">{transcript.filename}</h2>
          <p className="mt-1 font-mono text-[11.5px] text-ink-faint">
            {durationLabel(transcript.durationSec)} · {transcript.segments.length} segments · {switches.size} language switches ·{" "}
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
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="lang-es px-1 font-display text-sm">Spanish</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="px-1 font-display text-sm text-ink">English</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="switch-tag !text-[10.5px]"><SwitchArrows /><span className="sr-only">⇄</span> switch</span> first word after a language change</span>
        </p>
        <div className="mt-4 flex flex-col gap-3 border-t border-rule pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">On this transcript</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={correcting} onClick={() => { setCorrecting((on) => !on); setDraft(null); }} className={correcting ? "rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white" : btn}>
                {correcting ? "Correcting" : "Correct"}
              </button>
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
              <span className="inline-flex overflow-hidden rounded-md border border-rule-strong [&>button]:rounded-none [&>button]:border-0 [&>button+button]:border-l [&>button+button]:border-rule-strong">
                <button type="button" onClick={() => download(`${base}.txt`, toTxt(transcript), "text/plain")} className={btn}>TXT</button>
                <button type="button" onClick={() => download(`${base}.srt`, toSrt(transcript), "application/x-subrip")} className={btn}>SRT</button>
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
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Rename.</span> Click the speaker. Enter saves the name, and the quote uses it.</li>
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Correct.</span> Turn on Correct, then click a word. The timecode stays put.</li>
        <li className="text-xs leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Copy quote.</span> Select words, or copy one turn. The name and clock time come with it.</li>
      </ul>

      <ol ref={bodyRef} className="divide-y divide-rule">
        {transcript.segments.map((s, si) => (
          <li key={`${s.start}-${si}`} className={`grid gap-x-8 gap-y-1.5 px-4 py-5 sm:px-8 ${transcript.translation ? "md:grid-cols-[150px_minmax(0,1fr)_minmax(0,0.8fr)]" : "md:grid-cols-[150px_minmax(0,1fr)]"}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft md:flex-col md:items-start md:pt-1.5">
              <div className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.speaker % 2 ? "border-2 border-ink" : "bg-ink"}`} aria-hidden="true" />
                {renaming?.si === si ? (
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
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setRenaming({ si, speaker: s.speaker, name: transcript.speakers?.[String(s.speaker)] ?? "" });
                    }}
                    title="Rename this speaker"
                    className="rounded-sm text-left underline decoration-dotted decoration-rule-strong underline-offset-4 hover:decoration-accent"
                  >
                    {speakerLabel(s.speaker, transcript.speakers)}
                  </button>
                )}
              </div>
              <span className="font-mono text-[11.5px] text-ink-faint">{clock(s.start)}</span>
              <span className={`rounded-sm px-1.5 py-px font-mono text-[10.5px] font-semibold uppercase tracking-wider ${langChip(s.lang)}`}>{s.lang}</span>
              <button type="button" onClick={() => void copyText(formatSegmentQuote(transcript, si), `seg:${si}`)} className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                {copiedKey === `seg:${si}` ? "Copied" : "Copy quote"}
              </button>
            </div>
            <div className="min-w-0">
              <div className="font-display text-[18px] leading-[1.75] text-ink sm:text-[19px]" data-testid="segment">
                {s.words.map((w, wi) => {
                  const sw = switches.has(`${si}:${wi}`);
                  const prevEs = wi > 0 && s.words[wi - 1].lang === "es" && w.lang === "es" && !sw;
                  const editing = draft?.si === si && draft.wi === wi;
                  const mark = [w.lang === "es" ? "lang-es" : "", sw ? "switch-word" : ""].join(" ").trim() || undefined;
                  return (
                    <span key={`${w.start}-${wi}`}>
                      {wi ? <span className={prevEs ? "lang-es" : undefined}> </span> : null}
                      {sw ? <span className="switch-tag" aria-hidden="true"><SwitchArrows />{w.lang === "es" ? "ES" : "EN"}</span> : null}
                      {sw ? <span className="sr-only">⇄ </span> : null}
                      {editing ? (
                        <input
                          autoFocus
                          aria-label="Correct this word"
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
                          className={`rounded border border-accent bg-paper px-1 font-display text-[18px] ${draft.lang === "es" ? "lang-es" : ""}`}
                        />
                      ) : correcting ? (
                        <button
                          type="button"
                          data-si={si}
                          data-wi={wi}
                          onClick={() => setDraft({ si, wi, w: w.w, lang: w.lang })}
                          className={`cursor-pointer rounded-sm hover:bg-mark/60 ${mark ?? ""}`}
                          title="Correct this word"
                        >
                          {w.w}
                        </button>
                      ) : (
                        <span className={mark} data-si={si} data-wi={wi} data-lang={w.lang} data-switch={sw ? "1" : undefined} title={sw ? `Switch to ${w.lang === "es" ? "Spanish" : "English"}` : undefined}>
                          {w.w}
                        </span>
                      )}
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
                  <button type="button" onClick={deleteDraftWord} disabled={saving} className="rounded-md px-2 py-1 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete word</button>
                  <button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-soft hover:text-ink">Cancel</button>
                </div>
              )}
            </div>
            {transcript.translation && (
              <p className="border-rule text-[15px] italic leading-relaxed text-ink-soft md:border-l md:pl-6" aria-label="English reference">
                <span className="not-italic font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">EN reference · </span>
                {transcript.translation[si] ? transcript.translation[si] : <span className="not-italic text-ink-faint">Out of date — use Update English.</span>}
              </p>
            )}
          </li>
        ))}
      </ol>
      {transcript.segments.length === 0 && <p className="px-8 py-6 text-sm text-ink-faint">No speech found in this file.</p>}
      <p className="sr-only">{transcript.segments.map(segmentText).join(" ")}</p>
    </section>
  );
}
