import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How SwitchQuote handles waitlist signups, Google sign-in, interview audio and transcripts.",
};

const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-ink-soft leading-relaxed">{children}</p>;

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-ink">Privacy</h1>
      <h2 className="mt-8 text-lg font-semibold text-ink">What we collect</h2>
      <P>
        Waitlist: email, role, whether you run bilingual interviews, and a timestamp. Sign-in: your Google
        account email, name and profile picture. Transcription: the transcripts you create, the file name and
        length, and usage records needed to run credits and abuse limits. If you buy credits, Stripe processes the payment.
      </P>
      <h2 className="mt-8 text-lg font-semibold text-ink">Your audio</h2>
      <P>
        We process interview media only to produce the transcript you asked for. Audio is sent to our speech-to-text
        provider and is not stored by {site.name}. Transcripts are kept for 30 days, or until you click Delete.
      </P>
      <P>
        We don&apos;t use your audio or transcripts to train models. You are responsible for recording consent and
        source protection.
      </P>
      <h2 className="mt-8 text-lg font-semibold text-ink">Who processes it</h2>
      <P>
        Cloudflare (hosting, database, bot protection), Deepgram (speech-to-text), Stripe (payments), and — only when you click
        Translate to English — OpenRouter, which routes the request to Google Gemini. Google handles sign-in.
      </P>
      <P>We do not sell your data.</P>
    </div>
  );
}
