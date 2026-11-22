"use client";

import Link from "next/link";
import { hrefWithSrc } from "@/lib/src";
import { useSrc } from "@/components/useSrc";

export function TrackedLink({
  href,
  src,
  className,
  children,
}: {
  href: string;
  src?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const stored = useSrc();
  return (
    <Link href={hrefWithSrc(href, src || stored)} className={className}>
      {children}
    </Link>
  );
}
