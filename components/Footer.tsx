import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-rule bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <LogoMark className="h-5 w-5" />
              {site.name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{site.tagline}</p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
              {site.phrases.quoteReady} · {site.phrases.notMeetingNotes}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/pricing" className="text-ink-soft hover:text-accent">
              Pricing
            </Link>
            <Link href="/privacy" className="text-ink-soft hover:text-accent">
              Privacy
            </Link>
            <Link href="/terms" className="text-ink-soft hover:text-accent">
              Terms
            </Link>
            <Link href="/otter-alternative-for-journalists" className="text-ink-soft hover:text-accent">
              Otter alternative
            </Link>
            <Link href="/transcribe-spanish-english-interview" className="text-ink-soft hover:text-accent">
              Spanish–English interviews
            </Link>
          </div>
        </div>
        <p className="mt-8 border-t border-rule pt-6 text-xs text-ink-faint">
          © {new Date().getFullYear()} {site.name}. Private test — transcription is invite-only. Allowlisted accounts can buy credits.
        </p>
      </div>
    </footer>
  );
}
