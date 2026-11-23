const SRC = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function cleanSrc(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  return SRC.test(value) ? value : "";
}

/** Put `src` on a path, keeping any other query and hash. */
export function hrefWithSrc(path: string, src: string): string {
  const value = cleanSrc(src);
  if (!value) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = base.indexOf("?");
  const pathname = queryAt >= 0 ? base.slice(0, queryAt) : base;
  const params = new URLSearchParams(queryAt >= 0 ? base.slice(queryAt + 1) : "");
  params.set("src", value);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
