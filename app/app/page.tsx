import type { Metadata } from "next";
import { TranscribeApp } from "@/components/TranscribeApp";

export const metadata: Metadata = {
  title: "Upload Interview",
  description: "Upload a Spanish–English interview and get a transcript that keeps both languages, with switch-point highlights.",
};

export default function AppPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-800">Transcribe, don&apos;t translate</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Upload your Spanish–English interview</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        You get the Spanish and the English exactly as spoken, with speakers, timecodes and every language switch highlighted. Translate to English is optional and shows up next to the original — it never replaces it.
      </p>
      <div className="mt-8">
        <TranscribeApp />
      </div>
    </section>
  );
}
