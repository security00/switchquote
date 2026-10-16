"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { sampleTranscript } from "@/lib/sample-transcript";
import { durationLabel, type Transcript } from "@/lib/transcript";
import { formatCreditAmount } from "@/lib/credit-units";
import { DeskGuide } from "@/components/DeskGuide";
import { TranscriptView } from "@/components/TranscriptView";

type Me = {
  signedIn: boolean;
  googleConfigured: boolean;
  turnstileSiteKey: string | null;
  limits: { maxFileMb: number; maxDurationMin: number };
  privateTest: boolean;
  smokeAnon?: boolean;
  email?: string | null;
  access?: "open" | "allowed" | "waitlist";
  creditsLeft?: number;
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

export function TranscribeApp({ introTop, notice, startWithSample = false }: { introTop?: React.ReactNode; notice?: string | null; startWithSample?: boolean } = {}) {
  const [me, setMe] = useState<Me | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "upload" | "translate">("");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<Transcript | null>(() => (startWithSample ? structuredClone(sampleTranscript) : null));
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

  const smokeGuest = Boolean(me && !me.signedIn && me.smokeAnon);
  const canUse = Boolean((me?.signedIn && me.access !== "waitlist") || smokeGuest);
  const back = startWithSample ? "/" : "/app";

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
      else {
        const id = transcript.id;
        setTranscript((current) => (current && current.id === id ? { ...current, translation: body.translation ?? null } : current));
      }
    } finally {
      if (token) resetWidget();
      setBusy("");
    }
  }

  const isSample = Boolean(startWithSample && transcript?.id === sampleTranscript.id);

  async function remove() {
    if (!transcript) return;
    if (isSample) {
      if (!confirm("Reset this sample to the original words?")) return;
      setTranscript(structuredClone(sampleTranscript));
      return;
    }
    if (!confirm("Delete this transcript now? This can't be undone.")) return;
    await fetch(`/api/transcripts/${transcript.id}`, { method: "DELETE" });
    setTranscript(startWithSample ? structuredClone(sampleTranscript) : null);
    void loadMe();
  }

  const toolColumn = !me ? (
    <div className="rounded-xl border border-rule bg-surface p-6 shadow-sm">
      <p className="text-sm text-ink-faint">Loading…</p>
    </div>
  ) : (
    <div className="space-y-3">
      {!me.signedIn && !smokeGuest && (
        <div className="rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">{startWithSample ? "Your interview" : "Step 1 · Start here"}</p>
          <h2 className="mt-2 text-xl">{startWithSample ? "Upload your interview" : "Sign in to transcribe"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {startWithSample
              ? "The sample is ready to edit. Sign in to transcribe a file of your own."
              : "Use Google, then upload the interview. The three steps show what to do once the transcript opens."}
            {me.privateTest ? " Transcription is in a private test for now." : ""}
          </p>
          {startWithSample ? (
            <button
              type="button"
              onClick={() => me.googleConfigured && signIn("google", { redirectTo: back })}
              disabled={!me.googleConfigured}
              className="mt-4 w-full rounded-md border border-dashed border-rule-strong bg-paper px-4 py-6 text-left text-sm text-ink-soft hover:border-accent/50 disabled:cursor-not-allowed"
            >
              <span className="block font-semibold text-ink">Choose an audio file</span>
              <span className="mt-1 block text-xs leading-relaxed">MP3, M4A, MP4, WAV, OGG or FLAC · up to {me.limits.maxFileMb} MB and {me.limits.maxDurationMin} minutes.</span>
            </button>
          ) : null}
          {me.googleConfigured ? (
            <button onClick={() => signIn("google", { redirectTo: back })} className="mt-4 w-full rounded-md bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-strong sm:w-auto">
              {startWithSample ? "Sign in to upload" : "Continue with Google"}
            </button>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink-soft">Google sign-in isn&apos;t switched on yet.</p>
          )}
        </div>
      )}

      {me.signedIn && me.access !== "waitlist" && typeof me.creditsLeft === "number" ? (
        <p className="px-1 text-[13px] text-ink-soft">
          Credits left: <strong className="font-medium text-ink">{formatCreditAmount(me.creditsLeft)}</strong>{" "}
          <Link href="/pricing" className="text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
            Pricing
          </Link>
        </p>
      ) : null}

      {me.signedIn && me.access === "waitlist" && (
        <div className="rounded-xl border border-es-line/30 bg-es-tint p-6 text-sm leading-relaxed text-ink">
          Transcription is in a private test right now. This account isn&apos;t on the list yet.
        </div>
      )}

      {canUse && (
        <div className="rounded-xl border border-rule bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-6">
          {smokeGuest && (
            <p className="mb-4 rounded-md border border-dashed border-rule-strong bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
              Private smoke test — not a public launch. Signed-in transcription stays invite-only. Complete the human check, then upload a short clip. Results from this browser are deleted after 24 hours. Audio is not stored.
            </p>
          )}
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">{startWithSample ? "Your interview" : "Step 1 · Start here"}</p>
          <label className="mt-2 block text-sm font-semibold text-ink" htmlFor="audio">Interview audio</label>
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
                    <span className="shrink-0 font-mono text-xs text-ink-faint"> · {durationLabel(t.duration_sec)}</span>
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

  return (
    <div>
      {notice ? (
        <p className="mb-6 rounded-md border border-rule bg-surface px-4 py-3 text-sm leading-relaxed text-ink-soft" role="status">
          {notice}
        </p>
      ) : null}
      {startWithSample && introTop ? <div className="mb-5">{introTop}</div> : null}
      {startWithSample ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-2 lg:order-1">
            {transcript ? (
              <TranscriptView
                transcript={transcript}
                busy={busy}
                persist={!isSample}
                flushTop
                onTranslate={() => void translate()}
                onDelete={() => void remove()}
                onChange={setTranscript}
              />
            ) : null}
          </div>
          <div className="order-1 lg:order-2 lg:sticky lg:top-20">{toolColumn}</div>
        </div>
      ) : null}

      <div className={startWithSample
        ? "mt-12"
        : "grid items-start gap-x-10 gap-y-8 [grid-template-areas:'top'_'guide'_'tool'] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-y-12 lg:[grid-template-areas:'top_tool'_'guide_guide']"}>
        {startWithSample ? null : <div className="[grid-area:top]">{introTop}</div>}
        <div className={startWithSample ? undefined : "[grid-area:guide]"}>
          <DeskGuide sampleOpen={isSample} />
        </div>
        {startWithSample ? null : <div className="[grid-area:tool] lg:sticky lg:top-20">{toolColumn}</div>}
      </div>

      {!startWithSample && transcript ? (
        <TranscriptView
          transcript={transcript}
          busy={busy}
          onTranslate={() => void translate()}
          onDelete={() => void remove()}
          onChange={setTranscript}
        />
      ) : null}
    </div>
  );
}
