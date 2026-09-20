import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "Minimal terms for SwitchQuote Phase A marketing site.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-slate-900">Terms</h1>
      <p className="mt-4 text-slate-600 leading-relaxed">
        {site.name} Phase A is a marketing and waitlist site. Samples are
        illustrative. There is no paid service, upload, or guaranteed availability
        date yet.
      </p>
      <p className="mt-4 text-slate-600 leading-relaxed">
        By joining the waitlist you confirm the email is yours and you agree to
        receive product updates about {site.name}. You may request removal before
        launch by replying to a waitlist message once email is enabled.
      </p>
      <p className="mt-4 text-slate-600 leading-relaxed">
        The site is provided as-is during preview; full terms will ship with
        billing and upload features.
      </p>
    </div>
  );
}
