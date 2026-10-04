import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { navLinks, site } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-ink">{site.name}</span>
            <span className="mt-1 hidden text-[11px] text-ink-faint sm:block">{site.phrases.transcribe}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-medium md:flex" aria-label="Main">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 text-ink-soft transition-colors hover:bg-paper hover:text-ink">
              {link.label}
            </Link>
          ))}
          <Link href="/#waitlist" className="ml-2 rounded-md bg-accent px-3.5 py-2 text-white shadow-sm transition-colors hover:bg-accent-strong">
            Join waitlist
          </Link>
        </nav>

        {/* Mobile: same links in a disclosure menu (no JS). */}
        <details className="group relative md:hidden">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-rule px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <span className="flex w-4 flex-col gap-[3px]" aria-hidden="true">
              <span className="h-[2px] rounded bg-ink" />
              <span className="h-[2px] rounded bg-ink" />
              <span className="h-[2px] rounded bg-ink" />
            </span>
            <span className="sr-only">Menu</span>
          </summary>
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-rule bg-surface py-1 shadow-lg">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="block px-4 py-2.5 text-sm text-ink hover:bg-paper">
                {link.label}
              </Link>
            ))}
            <Link href="/#waitlist" className="mx-3 my-2 block rounded-md bg-accent px-3 py-2 text-center text-sm font-medium text-white">
              Join waitlist
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
