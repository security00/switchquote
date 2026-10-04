import type { Metadata } from "next";
import { TranscribeApp } from "@/components/TranscribeApp";

export const metadata: Metadata = {
  title: "Upload Interview",
  description: "Upload a Spanish–English interview and get a transcript that keeps both languages, with switch-point highlights.",
};

export default function AppPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-12">
      <TranscribeApp
        introTop={
          <>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">Transcribe, don&apos;t translate</p>
            <h1 className="mt-2 text-[32px] leading-[1.1] sm:mt-3 sm:text-[44px]">Upload your Spanish–English interview</h1>
          </>
        }
        introBody={
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base lg:-mt-2">
            You get the Spanish and the English exactly as spoken, with speakers, timecodes and every language switch highlighted. Translate to English is optional and shows up next to the original — it never replaces it.
          </p>
        }
      />
    </section>
  );
}
