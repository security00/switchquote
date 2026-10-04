import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for the SwitchQuote private test.",
};

const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-slate-600 leading-relaxed">{children}</p>;

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-slate-900">Terms</h1>
      <P>
        {site.name} is in a private test. Transcription is invite-only, free, and provided as-is, without a
        guaranteed availability date. There is no paid plan yet.
      </P>
      <P>
        Transcripts are AI drafts — not certified legal or medical records. Verify every quote before you publish.
        This is not legal advice and not a substitute for newsroom counsel.
      </P>
      <P>
        By uploading you confirm you have the right to the recording and your interviewees&apos; consent. Don&apos;t
        upload content you aren&apos;t allowed to share with our processors (see Privacy).
      </P>
      <P>
        By joining the waitlist you confirm the email is yours and agree to receive product updates about {site.name}.
      </P>
    </div>
  );
}
