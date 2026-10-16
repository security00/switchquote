import type { Metadata } from "next";
import { TranscribeApp } from "@/components/TranscribeApp";

export const metadata: Metadata = {
  title: "Upload Interview",
  description: "Upload a Spanish–English interview, then rename the speaker, correct a word, and copy a pull quote with the timecode.",
};

export default async function AppPage({ searchParams }: { searchParams: Promise<{ checkout?: string | string[] }> }) {
  const query = await searchParams;
  const checkout = Array.isArray(query.checkout) ? query.checkout[0] : query.checkout;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-12">
      <TranscribeApp
        notice={
          checkout === "success"
            ? "Payment submitted. Credits show up here after Stripe confirms the payment — this page does not add them. Refresh in a moment if the balance has not moved."
            : null
        }
        introTop={
          <>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-es">Transcribe, don&apos;t translate</p>
            <h1 className="mt-2 text-[32px] leading-[1.1] sm:mt-3 sm:text-[44px]">Upload your Spanish–English interview</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
              Both languages stay as spoken. On the transcript, rename the speaker, correct a word, and copy a pull quote with the name and the timecode. English is optional and sits beside the original.
            </p>
          </>
        }
      />
    </section>
  );
}
