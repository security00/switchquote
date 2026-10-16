"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { LogoMark } from "@/components/Logo";
import { navLinks, site } from "@/lib/site";

type Me = { signedIn?: boolean; googleConfigured?: boolean; email?: string | null; name?: string | null; image?: string | null };

export function Header() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const links = onHome ? navLinks.filter((link) => link.href !== "/app") : navLinks;
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: unknown) => {
        if (!cancel) setMe(data as Me);
      })
      .catch(() => {
        if (!cancel) setMe({});
      });
    return () => {
      cancel = true;
    };
  }, [pathname]);

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

        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 text-sm font-medium md:flex" aria-label="Main">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 text-ink-soft transition-colors hover:bg-paper hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
          <AccountControl me={me} pathname={pathname} />
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
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="block px-4 py-2.5 text-sm text-ink hover:bg-paper">
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function AccountControl({ me, pathname }: { me: Me | null; pathname: string }) {
  if (!me?.googleConfigured) return null;
  const back = pathname || "/";
  if (me.signedIn) return <AccountMenu me={me} back={back} />;
  return (
    <button type="button" onClick={() => signIn("google", { redirectTo: back })} className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-strong">
      Sign in
    </button>
  );
}

function AccountMenu({ me, back }: { me: Me; back: string }) {
  const [broken, setBroken] = useState(false);
  const src = avatarSrc(me.image);
  const showImage = Boolean(src) && !broken;
  return (
    <div className="group relative">
      <button type="button" aria-haspopup="menu" aria-label="Account" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-rule-strong bg-paper text-sm font-semibold text-ink">
        {showImage ? (
          // Google hosts the profile photo. A plain img avoids a remote-image allowlist.
          <img src={src ?? ""} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span aria-hidden="true">{initial(me.name, me.email)}</span>
        )}
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-full z-50 pt-1 group-hover:pointer-events-auto group-hover:visible group-focus-within:pointer-events-auto group-focus-within:visible">
        <div role="menu" className="min-w-36 overflow-hidden rounded-lg border border-rule bg-surface py-1 shadow-lg">
          <button type="button" role="menuitem" onClick={() => signOut({ redirectTo: back })} className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-paper">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function avatarSrc(image: string | null | undefined): string | null {
  if (!image) return null;
  try {
    const url = new URL(image);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function initial(name?: string | null, email?: string | null): string {
  const source = (name || email || "?").trim();
  return (source.slice(0, 1) || "?").toUpperCase();
}
