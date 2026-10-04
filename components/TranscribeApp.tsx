"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { clock, segmentText, speakerLabel, switchPoints, toJson, toSrt, toTxt, type Transcript } from "@/lib/transcript";
import { toDocx } from "@/lib/docx";

type Me = {
  signedIn: boolean;
  googleConfigured: boolean;
  turnstileSiteKey: string | null;
  limits: { maxFileMb: number; maxDurationMin: number };
  privateTest: boolean;
  email?: string | null;
  access?: "open" | "allowed" | "waitlist";
  secondsLeft?: number;
  transcripts?: { id: string; filename: string; duration_sec: number; status: string; created_at: number }[];
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const ACCEPT = ".mp3,.m4a,.mp4,.wav,.ogg,.opus,.flac,audio/*,video/mp4";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Two-way arrow drawn as SVG (the ⇄ glyph is missing from most UI fonts). */
function SwitchArrows() {
  return (
    <svg viewBox="0 0 12 12" className="mr-0.5 h-[0.95em] w-[0.95em]" aria-hidden="true">
      <path d="M2 4h7.5M7.5 2l2 2-2 2M10 8H2.5M4.5 6l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function minutes(sec: number) {
  return sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.round(sec)} s`;
}

export function TranscribeApp({ introTop, introBody }: { introTop?: React.ReactNode; introBody?: React.ReactNode } = {}) {
  const [me, setMe] = useState<Me | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "upload" | "translate">("");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [token, setToken] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    setMe((await res.json()) as Me);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json() as Promise<Me>)
      .then((data) => alive && setMe(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const canUse = Boolean(me?.signedIn && me.access !== "waitlist");

  useEffect(() => {
    if (!canUse || !me?.turnstileSiteKey || !widgetRef.current) return;
    const siteKey = me.turnstileSiteKey;
    const mount = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        action: "transcribe",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (window.turnstile) mount();
    else if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    } else {
      const t = setInterval(() => window.turnstile && (clearInterval(t), mount()), 200);
      return () => clearInterval(t);
    }
  }, [canUse, me?.turnstileSiteKey]);

  const resetWidget = () => {
    setToken("");
    if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
  };

  async function open(id: string) {
    setError("");
    const res = await fetch(`/api/transcripts/${id}`, { cache: "no-store" });
    const body = (await res.json()) as { error?: string; transcript?: Transcript };
    if (!res.ok || !body.transcript) return setError(body.error || "Could not open the transcript.");
    setTranscript(body.transcript as Transcript);
  }

  async function upload() {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form, headers: token ? { "x-turnstile-token": token } : {} });
      const body = (await res.json().catch(() => ({ error: `Upload failed (${res.status}).` }))) as { error?: string; id?: string };
      if (!res.ok) {
        setError(body.error || `Upload failed (${res.status}).`);
      } else {
        await open(body.id || "");
        setFile(null);
        const input = document.getElementById("audio") as HTMLInputElement | null;
        if (input) input.value = "";
      }
    } finally {
      resetWidget();
      setBusy("");
      void loadMe();
    }
  }

  async function translate() {
    if (!transcript) return;
    setBusy("translate");
    setError("");
    try {
      const res = await fetch(`/api/transcripts/${transcript.id}/translate`, { method: "POST", headers: token ? { "x-turnstile-token": token } : {} });
      const body = (await res.json().catch(() => ({ error: `Translation failed (${res.status}).` }))) as { error?: string; translation?: string[] };
      if (!res.ok) setError(body.error || `Translation failed (${res.status}).`);
      else setTranscript({ ...transcript, translation: body.translation ?? null });
    } finally {
      if (token) resetWidget();
      setBusy("");
    }
  }

  async function remove() {
    if (!transcript || !confirm("Delete this transcript now? This can't be undone.")) return;
    await fetch(`/api/transcripts/${transcript.id}`, { method: "DELETE" });
    setTranscript(null);
    void loadMe();
  }

  const switches = useMemo(() => (transcript ? switchPoints(transcript.segments) : new Set<string>()), [transcript]);
  const base = transcript ? transcript.filename.replace(/\.[^.]+$/, "") || "transcript" : "transcript";

  const toolColumn = !me ? (
    <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm">
      <p className="text-sm text-ink-faint">Loading…</p>
    </div>
  ) : (
    <div className="space-y-3">
      {!me.signedIn && (
        <div className="rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
          <h2 className="text-xl">Sign in to transcribe</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Transcription needs a Google account. {me.privateTest ? "It's in a private test for now; everyone else can join the waitlist." : ""}
          </p>
          {me.googleConfigured ? (
            <button onClick={() => signIn("google", { redirectTo: "/app" })} className="mt-5 w-full rounded-md bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-strong sm:w-auto">
              Continue with Google
            </button>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink-soft">Google sign-in isn&apos;t switched on yet.</p>
          )}
          <p className="mt-4 text-sm">
            <Link href="/#waitlist" className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">Join the waitlist →</Link>
          </p>
        </div>
      )}

      {me.signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[13px] text-ink-soft">
          <span>
            Signed in as <strong className="font-medium text-ink">{me.email}</strong>
            {me.access !== "waitlist" && typeof me.secondsLeft === "number" ? <> · Free minutes left: <strong className="font-medium text-ink">{minutes(me.secondsLeft)}</strong></> : null}
          </span>
          <button onClick={() => signOut({ redirectTo: "/app" })} className="text-ink-faint underline-offset-4 hover:text-ink hover:underline">Sign out</button>
        </div>
      )}

      {me.signedIn && me.access === "waitlist" && (
        <div className="rounded-xl border border-es-line/30 bg-es-tint p-6 text-sm leading-relaxed text-ink">
          Transcription is in a private test right now. This account isn&apos;t on the list yet —{" "}
          <Link href="/#waitlist" className="font-medium underline underline-offset-4">join the waitlist</Link> and we&apos;ll let you know.
        </div>
      )}

      {canUse && (
        <div className="rounded-xl border border-rule bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-6">
          <label className="block text-sm font-semibold text-ink" htmlFor="audio">Interview audio</label>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            MP3, M4A, MP4, WAV, OGG or FLAC · up to {me.limits.maxFileMb} MB and {me.limits.maxDurationMin} minutes. We transcribe — we don&apos;t translate your Spanish into English. Audio isn&apos;t stored.
          </p>
          <input
            id="audio"
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-4 block w-full cursor-pointer rounded-md border border-rule-strong bg-paper text-sm text-ink-soft file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-rule-strong file:bg-surface file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-ink hover:border-accent/50"
          />
          <div ref={widgetRef} className="mt-3 min-h-[65px]" />
          <button
            onClick={upload}
            disabled={!file || busy !== "" || (Boolean(me.turnstileSiteKey) && !token)}
            className="mt-2 w-full rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-white"
          >
            {busy === "upload" ? "Transcribing…" : "Transcribe"}
          </button>
          {me.transcripts && me.transcripts.length > 0 && (
            <div className="mt-5 border-t border-rule pt-4">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-faint">Recent</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {me.transcripts.filter((t) => t.status === "done").map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-3">
                    <button onClick={() => open(t.id)} className="truncate text-left font-medium text-accent underline decoration-accent/25 underline-offset-4 hover:decoration-accent">{t.filename}</button>
                    <span className="shrink-0 font-mono text-xs text-ink-faint"> · {minutes(t.duration_sec)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    </div>
  );

  const btn = "rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-50";

  return (
    <div>
      <div className="grid gap-x-12 gap-y-6 [grid-template-areas:'top'_'tool'_'body'] lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'top_tool'_'body_tool']">
        <div className="[grid-area:top]">{introTop}</div>
        <div className="[grid-area:tool]">{toolColumn}</div>
        {introBody ? <div className="[grid-area:body]">{introBody}</div> : null}
      </div>

      {transcript && (
        <section className="mt-10 overflow-clip rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.16)]" aria-label="Transcript">
          <div className="z-10 border-b md:sticky md:top-14 border-rule bg-surface/95 px-4 py-4 backdrop-blur sm:px-8 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h2 className="truncate text-2xl leading-tight">{transcript.filename}</h2>
                <p className="mt-1 font-mono text-[11.5px] text-ink-faint">
                  {minutes(transcript.durationSec)} · {transcript.segments.length} segments · {switches.size} language switches ·{" "}
                  <span className="rounded-sm bg-mark/60 px-1 font-sans font-medium text-ink">AI draft — verify quotes before publishing</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={translate} disabled={busy !== "" || Boolean(transcript.translation)} className="rounded-md border border-accent bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-60 disabled:hover:bg-accent-tint disabled:hover:text-accent">
                  {busy === "translate" ? "Translating…" : transcript.translation ? "English shown" : "Translate to English"}
                </button>
                <span className="inline-flex overflow-hidden rounded-md border border-rule-strong [&>button]:rounded-none [&>button]:border-0 [&>button+button]:border-l [&>button+button]:border-rule-strong">
                  <button onClick={() => download(`${base}.txt`, toTxt(transcript), "text/plain")} className={btn}>TXT</button>
                  <button onClick={() => download(`${base}.srt`, toSrt(transcript), "application/x-subrip")} className={btn}>SRT</button>
                  <button onClick={() => download(`${base}.json`, toJson(transcript), "application/json")} className={btn}>JSON</button>
                  <button onClick={() => download(`${base}.docx`, toDocx(transcript) as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")} className={btn}>DOCX</button>
                </span>
                <button onClick={remove} className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-red-700 hover:bg-red-50">Delete</button>
              </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><span className="lang-es px-1 font-display text-sm">Spanish</span></span>
              <span className="inline-flex items-center gap-1.5"><span className="px-1 font-display text-sm text-ink">English</span></span>
              <span className="inline-flex items-center gap-1.5"><span className="switch-tag !text-[10.5px]"><SwitchArrows /><span className="sr-only">⇄</span> switch</span> first word after a language change</span>
            </p>
          </div>

          <ol className="divide-y divide-rule">
            {transcript.segments.map((s, si) => (
              <li key={si} className={`grid gap-x-8 gap-y-1.5 px-4 py-5 sm:px-8 ${transcript.translation ? "md:grid-cols-[150px_minmax(0,1fr)_minmax(0,0.8fr)]" : "md:grid-cols-[150px_minmax(0,1fr)]"}`}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft md:flex-col md:items-start md:pt-1.5">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.speaker % 2 ? "border-2 border-ink" : "bg-ink"}`} aria-hidden="true" />
                    {speakerLabel(s.speaker)}
                  </span>
                  <span className="font-mono text-[11.5px] text-ink-faint">{clock(s.start)}</span>
                  <span
                    className={`rounded-sm px-1.5 py-px font-mono text-[10.5px] font-semibold uppercase tracking-wider ${
                      s.lang === "es" ? "bg-es-tint text-es ring-1 ring-es-line/40" : s.lang === "en" ? "bg-en-tint text-en ring-1 ring-en/30" : s.lang === "mixed" ? "text-ink ring-1 ring-ink/30 [background:linear-gradient(90deg,var(--es-tint)_50%,var(--en-tint)_50%)]" : "bg-paper text-ink-faint ring-1 ring-rule"
                    }`}
                  >
                    {s.lang}
                  </span>
                </p>
                <p className="font-display text-[18px] leading-[1.75] text-ink sm:text-[19px]" data-testid="segment">
                  {s.words.map((w, wi) => {
                    const sw = switches.has(`${si}:${wi}`);
                    const prevEs = wi > 0 && s.words[wi - 1].lang === "es" && w.lang === "es" && !sw;
                    return (
                      <span key={wi}>
                        {wi ? <span className={prevEs ? "lang-es" : undefined}> </span> : null}
                        {sw ? <span className="switch-tag" aria-hidden="true"><SwitchArrows />{w.lang === "es" ? "ES" : "EN"}</span> : null}
                        <span
                          className={[w.lang === "es" ? "lang-es" : "", sw ? "switch-word" : ""].join(" ").trim() || undefined}
                          data-lang={w.lang}
                          data-switch={sw ? "1" : undefined}
                          title={sw ? `Switch to ${w.lang === "es" ? "Spanish" : "English"}` : undefined}
                        >
                          <span className="sr-only">{sw ? "⇄ " : ""}</span>
                          {w.w}
                        </span>
                      </span>
                    );
                  })}
                </p>
                {transcript.translation && (
                  <p className="border-rule text-[15px] italic leading-relaxed text-ink-soft md:border-l md:pl-6" aria-label="English reference">
                    <span className="not-italic font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-faint">EN reference · </span>
                    {transcript.translation[si] || <span className="text-ink-faint">—</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {transcript.segments.length === 0 && <p className="px-8 py-6 text-sm text-ink-faint">No speech found in this file.</p>}
          <p className="sr-only">{transcript.segments.map(segmentText).join(" ")}</p>
        </section>
      )}
    </div>
  );
}
