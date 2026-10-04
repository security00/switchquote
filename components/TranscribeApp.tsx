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

function minutes(sec: number) {
  return sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.round(sec)} s`;
}

export function TranscribeApp() {
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

  if (!me) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-8">
      {!me.signedIn && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sign in to transcribe</h2>
          <p className="mt-2 text-sm text-slate-600">
            Transcription needs a Google account. {me.privateTest ? "It's in a private test for now; everyone else can join the waitlist." : ""}
          </p>
          {me.googleConfigured ? (
            <button onClick={() => signIn("google", { redirectTo: "/app" })} className="mt-4 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-900">
              Continue with Google
            </button>
          ) : (
            <p className="mt-4 text-sm text-amber-700">Google sign-in isn&apos;t switched on yet.</p>
          )}
          <p className="mt-4 text-sm">
            <Link href="/#waitlist" className="font-medium text-teal-800 hover:text-teal-900">Join the waitlist →</Link>
          </p>
        </div>
      )}

      {me.signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Signed in as <strong className="text-slate-900">{me.email}</strong>
            {me.access !== "waitlist" && typeof me.secondsLeft === "number" ? <> · Free minutes left: <strong className="text-slate-900">{minutes(me.secondsLeft)}</strong></> : null}
          </span>
          <button onClick={() => signOut({ redirectTo: "/app" })} className="text-slate-500 hover:text-slate-800">Sign out</button>
        </div>
      )}

      {me.signedIn && me.access === "waitlist" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Transcription is in a private test right now. This account isn&apos;t on the list yet —{" "}
          <Link href="/#waitlist" className="font-medium underline">join the waitlist</Link> and we&apos;ll let you know.
        </div>
      )}

      {canUse && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-900" htmlFor="audio">Interview audio</label>
          <p className="mt-1 text-xs text-slate-500">
            MP3, M4A, MP4, WAV, OGG or FLAC · up to {me.limits.maxFileMb} MB and {me.limits.maxDurationMin} minutes. We transcribe — we don&apos;t translate your Spanish into English. Audio isn&apos;t stored.
          </p>
          <input id="audio" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-slate-800" />
          <div ref={widgetRef} className="mt-4 min-h-[65px]" />
          <button
            onClick={upload}
            disabled={!file || busy !== "" || (Boolean(me.turnstileSiteKey) && !token)}
            className="mt-2 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "upload" ? "Transcribing…" : "Transcribe"}
          </button>
          {me.transcripts && me.transcripts.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent</p>
              <ul className="mt-2 space-y-1 text-sm">
                {me.transcripts.filter((t) => t.status === "done").map((t) => (
                  <li key={t.id}>
                    <button onClick={() => open(t.id)} className="text-teal-800 hover:underline">{t.filename}</button>
                    <span className="text-slate-400"> · {minutes(t.duration_sec)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {transcript && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Transcript">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{transcript.filename}</h2>
              <p className="text-xs text-slate-500">
                {minutes(transcript.durationSec)} · {transcript.segments.length} segments · {switches.size} language switches · AI draft — verify quotes before publishing
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={translate} disabled={busy !== "" || Boolean(transcript.translation)} className="rounded-full border border-slate-300 px-3.5 py-1.5 hover:bg-slate-50 disabled:opacity-50">
                {busy === "translate" ? "Translating…" : transcript.translation ? "English shown" : "Translate to English"}
              </button>
              <button onClick={() => download(`${base}.txt`, toTxt(transcript), "text/plain")} className="rounded-full border border-slate-300 px-3.5 py-1.5 hover:bg-slate-50">TXT</button>
              <button onClick={() => download(`${base}.srt`, toSrt(transcript), "application/x-subrip")} className="rounded-full border border-slate-300 px-3.5 py-1.5 hover:bg-slate-50">SRT</button>
              <button onClick={() => download(`${base}.json`, toJson(transcript), "application/json")} className="rounded-full border border-slate-300 px-3.5 py-1.5 hover:bg-slate-50">JSON</button>
              <button onClick={() => download(`${base}.docx`, toDocx(transcript) as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")} className="rounded-full border border-slate-300 px-3.5 py-1.5 hover:bg-slate-50">DOCX</button>
              <button onClick={remove} className="rounded-full px-3.5 py-1.5 text-red-700 hover:bg-red-50">Delete</button>
            </div>
          </div>
          <p className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span><span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-900">Spanish</span></span>
            <span><span className="px-1.5 py-0.5 text-slate-900">English</span></span>
            <span><span className="rounded bg-amber-200 px-1.5 py-0.5 text-slate-900">⇄ switch</span> first word after a language change</span>
          </p>
          <ol className="mt-4 divide-y divide-slate-100">
            {transcript.segments.map((s, si) => (
              <li key={si} className={`grid gap-3 py-3 ${transcript.translation ? "md:grid-cols-2" : ""}`}>
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {speakerLabel(s.speaker)} · {clock(s.start)} · <span className="uppercase">{s.lang}</span>
                  </p>
                  <p className="mt-1 leading-relaxed text-slate-900" data-testid="segment">
                    {s.words.map((w, wi) => {
                      const sw = switches.has(`${si}:${wi}`);
                      const cls = [sw ? "rounded bg-amber-200 px-0.5" : w.lang === "es" ? "rounded bg-teal-50 px-0.5 text-teal-900" : "", w.lang === "es" && sw ? "text-teal-900" : ""].join(" ");
                      return (
                        <span key={wi}>
                          {wi ? " " : ""}
                          <span className={cls} data-lang={w.lang} data-switch={sw ? "1" : undefined} title={sw ? `Switch to ${w.lang === "es" ? "Spanish" : "English"}` : undefined}>
                            {sw ? "⇄ " : ""}
                            {w.w}
                          </span>
                        </span>
                      );
                    })}
                  </p>
                </div>
                {transcript.translation && (
                  <p className="text-sm italic leading-relaxed text-slate-600 md:border-l md:border-slate-100 md:pl-3" aria-label="English reference">
                    <span className="not-italic text-xs font-medium text-slate-400">EN reference · </span>
                    {transcript.translation[si] || <span className="text-slate-400">—</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {transcript.segments.length === 0 && <p className="text-sm text-slate-500">No speech found in this file.</p>}
          <p className="sr-only">{transcript.segments.map(segmentText).join(" ")}</p>
        </section>
      )}
    </div>
  );
}
