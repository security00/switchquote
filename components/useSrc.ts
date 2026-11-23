"use client";

import { useSyncExternalStore } from "react";
import { cleanSrc } from "@/lib/src";

const KEY = "sq_src";

function readSrc(): string {
  const current = cleanSrc(new URLSearchParams(window.location.search).get("src"));
  if (current) sessionStorage.setItem(KEY, current);
  return cleanSrc(sessionStorage.getItem(KEY));
}

/** Remember `?src=` so later /app and /pricing links keep the same CTA. */
export function useSrc(): string {
  return useSyncExternalStore(subscribe, readSrc, () => "");
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}
