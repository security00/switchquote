import Link from "next/link";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="font-semibold text-slate-900">{site.name}</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {site.tagline}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {site.phrases.quoteReady} · {site.phrases.notMeetingNotes}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/privacy" className="text-slate-600 hover:text-teal-800">
              Privacy
            </Link>
            <Link href="/terms" className="text-slate-600 hover:text-teal-800">
              Terms
            </Link>
            <Link
              href="/otter-alternative-for-journalists"
              className="text-slate-600 hover:text-teal-800"
            >
              Otter alternative
            </Link>
            <Link
              href="/transcribe-spanish-english-interview"
              className="text-slate-600 hover:text-teal-800"
            >
              Spanish–English interviews
            </Link>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-400">
          © {new Date().getFullYear()} {site.name}. Phase A — waitlist only; no
          upload or billing yet.
        </p>
      </div>
    </footer>
  );
}
