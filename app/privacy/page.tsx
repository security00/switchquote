import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Minimal privacy notice for SwitchQuote Phase A waitlist.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 prose prose-slate max-w-none">
      <h1 className="text-3xl font-semibold text-slate-900">Privacy</h1>
      <p className="mt-4 text-slate-600 leading-relaxed">
        Phase A collects waitlist signups only: email, role, whether you run
        bilingual interviews, and a timestamp. We use this to prioritize access
        for journalists and to contact you about {site.name}.
      </p>
      <p className="mt-4 text-slate-600 leading-relaxed">
        We do not sell waitlist data. Upload and audio processing are not live
        yet; this policy will expand before those features ship.
      </p>
      <p className="mt-4 text-slate-600 leading-relaxed">
        Questions: contact via the email you receive after signup (coming with
        launch comms).
      </p>
    </div>
  );
}
