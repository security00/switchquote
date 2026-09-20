import Link from "next/link";
import { navLinks, site } from "@/lib/site";

export function Header() {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="group flex flex-col gap-0.5">
          <span className="text-lg font-semibold tracking-tight text-slate-900 group-hover:text-teal-800 transition-colors">
            {site.name}
          </span>
          <span className="hidden text-xs text-slate-500 sm:block max-w-xs truncate">
            {site.phrases.transcribe}
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/#waitlist"
            className="ml-1 rounded-full bg-teal-800 px-3.5 py-2 text-white hover:bg-teal-900 transition-colors shadow-sm"
          >
            Join waitlist
          </Link>
        </nav>
      </div>
    </header>
  );
}
